"use client";

import { useState } from "react";
import { UnitsToggles } from "@/components/shell/UnitsControls";
import { useUnits } from "@/components/UnitsProvider";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Sheet,
  Skeleton,
  Stat,
  Tabs,
} from "@/components/ui";
import { KM_PER_AU, formatDistance, formatLightTime, formatTemp, lightTimeSeconds } from "@/lib/units";
import Tap from "@/components/ui/Tap";

export default function DesignSystemDemo() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { temp, distance } = useUnits();

  return (
    <>
      <section aria-labelledby="ds-buttons">
        <h2 id="ds-buttons">Buttons and badges</h2>
        <div className="btn-row">
          <Button variant="primary">Primary</Button>
          <Button>Default</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <ButtonLink href="/candidates">Link button</ButtonLink>
        </div>
        <div className="btn-row">
          <Badge tone="clean">Clean recovery</Badge>
          <Badge tone="eclipsing">Eclipsing binary</Badge>
          <Badge tone="ambiguous">Ambiguous</Badge>
          <Badge tone="marginal">Marginal</Badge>
          <Badge tone="noise">Likely noise</Badge>
          <Badge tone="unreviewed">Unreviewed</Badge>
          <Badge tone="info">Estimate</Badge>
        </div>
      </section>

      <section aria-labelledby="ds-units">
        <h2 id="ds-units">Units</h2>
        <Card>
          <UnitsToggles />
          <div className="stat-grid">
            <Stat value={formatDistance(KM_PER_AU, distance)} label="1 AU in your unit" hint="IAU definition" />
            <Stat value={formatLightTime(lightTimeSeconds(KM_PER_AU))} label="Light time for 1 AU" />
            <Stat value={formatTemp(273.15, temp)} label="Water freezes" hint="273.15 K" />
            <Stat value={formatTemp(373.15, temp)} label="Water boils" hint="373.15 K, sea level" />
          </div>
        </Card>
      </section>

      <section aria-labelledby="ds-tabs">
        <h2 id="ds-tabs">Tabs and sheet</h2>
        <Tabs
          label="Demo tabs"
          items={[
            { id: "one", label: "Overview", content: <p>Tabs move with the arrow keys.</p> },
            { id: "two", label: "Data", content: <p>Only the selected tab is in the tab order.</p> },
            { id: "three", label: "Sources", content: <p>Home and End jump to the ends.</p> },
          ]}
        />
        <div className="btn-row">
          <Button onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
            Open a sheet
          </Button>
        </div>
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Example sheet">
          <p>On a phone this slides up from the bottom. Press Escape or <Tap lower pointer="click" /> outside to close.</p>
        </Sheet>
      </section>

      <section aria-labelledby="ds-states">
        <h2 id="ds-states">Loading, error and empty</h2>
        <Card tone="flat">
          <Skeleton width="60%" height="1.4rem" />
          <div style={{ height: 8 }} />
          <Skeleton height="0.9rem" />
          <div style={{ height: 6 }} />
          <Skeleton width="80%" height="0.9rem" />
        </Card>
        <ErrorState title="Example: this data could not be loaded.">
          <p>Shown when a service is down, instead of stale or made-up numbers.</p>
        </ErrorState>
        <EmptyState title="Nothing here yet">
          <p>Shown when a list has no items.</p>
        </EmptyState>
      </section>
    </>
  );
}
