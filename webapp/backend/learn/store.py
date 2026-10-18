"""Lessons in Postgres: sync from content/lessons/ and read back (Phase 7).

sync() runs at API startup. It holds an advisory lock so two starting replicas
cannot interleave, skips lessons whose digest is unchanged, and never deletes a
question: one removed from the files is marked inactive, so later submissions
that point at it (Phase 8) stay valid.
"""
from __future__ import annotations

import json

from sqlalchemy import text
from sqlalchemy.engine import Engine

from learn.content import Lesson, lessons

SYNC_LOCK = 726017


def _j(v) -> str:
    return json.dumps(v, separators=(",", ":"))


def sync(eng: Engine, items: tuple[Lesson, ...] | None = None) -> int:
    """Bring the tables in line with the files. Returns how many lessons were written."""
    items = lessons() if items is None else items
    written = 0
    with eng.begin() as c:
        c.execute(text("select pg_advisory_xact_lock(:k)"), {"k": SYNC_LOCK})
        current = {r.slug: r.digest for r in c.execute(text("select slug, digest from lessons where active"))}
        c.execute(text("update lessons set active = false where not (slug = any(:s))"),
                  {"s": [l.slug for l in items]})
        for pos, l in enumerate(items):
            c.execute(text("update lessons set position = :p where slug = :s"), {"p": pos, "s": l.slug})
            if current.get(l.slug) == l.digest():
                continue
            lesson_id = c.execute(text("""
                insert into lessons (slug, position, title, summary, minutes, badge, links, digest, active, updated_at)
                values (:slug, :pos, :title, :summary, :minutes, cast(:badge as jsonb), cast(:links as jsonb), :digest,
                        true, now())
                on conflict (slug) do update set position = excluded.position, title = excluded.title,
                  summary = excluded.summary, minutes = excluded.minutes, badge = excluded.badge,
                  links = excluded.links, digest = excluded.digest, active = true, updated_at = now()
                returning id"""), {
                "slug": l.slug, "pos": pos, "title": l.title, "summary": l.summary, "minutes": l.minutes,
                "badge": _j(l.badge.model_dump()), "links": _j([k.model_dump() for k in l.links]),
                "digest": l.digest()}).scalar_one()
            c.execute(text("delete from lesson_steps where lesson_id = :l"), {"l": lesson_id})
            for i, st in enumerate(l.steps):
                c.execute(text("""insert into lesson_steps (lesson_id, position, heading, body, facts)
                                  values (:l, :p, :h, cast(:b as jsonb), cast(:f as jsonb))"""),
                          {"l": lesson_id, "p": i, "h": st.heading, "b": _j(st.body),
                           "f": _j([{"text": f.text, "kind": f.kind, "source": f.source.model_dump()}
                                    for f in st.facts])})
            quiz_id = c.execute(text("""insert into quizzes (lesson_id) values (:l)
                                        on conflict (lesson_id) do update set lesson_id = excluded.lesson_id
                                        returning id"""), {"l": lesson_id}).scalar_one()
            c.execute(text("update questions set active = false where quiz_id = :q and not (key = any(:k))"),
                      {"q": quiz_id, "k": [q.key for q in l.questions]})
            for i, q in enumerate(l.questions):
                numeric = q.kind == "numeric"
                qid = c.execute(text("""
                    insert into questions (quiz_id, key, position, kind, prompt, explanation, source, answer,
                                           tolerance, unit, active)
                    values (:quiz, :key, :pos, :kind, :prompt, :expl, cast(:src as jsonb), :ans, :tol, :unit, true)
                    on conflict (quiz_id, key) do update set position = excluded.position, kind = excluded.kind,
                      prompt = excluded.prompt, explanation = excluded.explanation, source = excluded.source,
                      answer = excluded.answer, tolerance = excluded.tolerance, unit = excluded.unit, active = true
                    returning id"""), {
                    "quiz": quiz_id, "key": q.key, "pos": i, "kind": q.kind, "prompt": q.prompt,
                    "expl": q.explanation, "src": _j(q.source.model_dump()),
                    "ans": q.answer if numeric else None, "tol": q.tolerance if numeric else None,
                    "unit": q.unit if numeric else None}).scalar_one()
                c.execute(text("delete from choices where question_id = :q"), {"q": qid})
                for j, ch in enumerate([] if numeric else q.choices):
                    c.execute(text("""insert into choices (question_id, position, text, correct, explanation)
                                      values (:q, :p, :t, :c, :e)"""),
                              {"q": qid, "p": j, "t": ch.text, "c": ch.correct, "e": ch.explanation})
            written += 1
    return written


def list_lessons(eng: Engine) -> list[dict]:
    with eng.connect() as c:
        rows = c.execute(text("""
            select l.slug, l.title, l.summary, l.minutes, l.badge, l.digest,
                   (select count(*) from lesson_steps s where s.lesson_id = l.id) as steps,
                   (select count(*) from questions q join quizzes z on z.id = q.quiz_id
                     where z.lesson_id = l.id and q.active) as questions
            from lessons l where l.active order by l.position""")).mappings().all()
    return [dict(r) for r in rows]


def get_lesson(eng: Engine, slug: str) -> dict | None:
    """A lesson with its steps and questions, without the answers."""
    with eng.connect() as c:
        l = c.execute(text("""select id, slug, title, summary, minutes, badge, links, digest
                              from lessons where slug = :s and active"""), {"s": slug}).mappings().first()
        if l is None:
            return None
        steps = c.execute(text("select heading, body, facts from lesson_steps where lesson_id = :l order by position"),
                          {"l": l["id"]}).mappings().all()
        qs = c.execute(text("""select q.id, q.key, q.kind, q.prompt, q.unit, q.tolerance
                               from questions q join quizzes z on z.id = q.quiz_id
                               where z.lesson_id = :l and q.active order by q.position"""),
                       {"l": l["id"]}).mappings().all()
        choices = c.execute(text("select question_id, text from choices where question_id = any(:ids) "
                                 "order by question_id, position"), {"ids": [q["id"] for q in qs]}).mappings().all()
    by_q: dict[int, list[str]] = {}
    for ch in choices:
        by_q.setdefault(ch["question_id"], []).append(ch["text"])
    out = {k: v for k, v in l.items() if k != "id"}
    out["steps"] = [dict(s) for s in steps]
    out["questions"] = [{"key": q["key"], "kind": q["kind"], "prompt": q["prompt"],
                         "choices": by_q.get(q["id"]) if q["kind"] == "choice" else None,
                         "unit": q["unit"], "tolerance": q["tolerance"]} for q in qs]
    return out


def get_question(eng: Engine, slug: str, key: str) -> dict | None:
    """One active question with everything grading needs."""
    with eng.connect() as c:
        q = c.execute(text("""select q.id, q.kind, q.explanation, q.source, q.answer, q.tolerance, q.unit
                              from questions q join quizzes z on z.id = q.quiz_id join lessons l on l.id = z.lesson_id
                              where l.slug = :s and l.active and q.key = :k and q.active"""),
                      {"s": slug, "k": key}).mappings().first()
        if q is None:
            return None
        choices = c.execute(text("select text, correct, explanation from choices where question_id = :q "
                                 "order by position"), {"q": q["id"]}).mappings().all()
    return {**dict(q), "choices": [dict(ch) for ch in choices]}
