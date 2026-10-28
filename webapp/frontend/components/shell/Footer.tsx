import FooterCredit from "./FooterCredit";

export default function Footer() {
  return (
    <footer className="site-footer">
      <FooterCredit />
      <p>
        Land outlines on the globe: Natural Earth (public domain).
      </p>
      <p>
        Planet Hunter is an independent project and is not affiliated with or endorsed by NASA.
      </p>
      <p>
        <a href="https://github.com/akramahmed1/planet-hunter" target="_blank" rel="noopener noreferrer">
          github.com/akramahmed1/planet-hunter
        </a>
      </p>
    </footer>
  );
}
