import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer">

      <div className="footer-inner">

        <div className="footer-brand">
          <div className="footer-logo">
            FASROD
          </div>

          <p>
            Streetwear tunisien.
          </p>

          <span>
            Made in Tunisia 🇹🇳
          </span>
        </div>

        <div className="footer-column">
          <h3>Fasrod</h3>

          <Link href="/">
            Nos articles
          </Link>

          <Link href="/">
            Nouveautés
          </Link>

          <Link href="/">
            Streetwear
          </Link>
        </div>

        <div className="footer-column">
          <h3>Informations</h3>

          <span>
            Livraison partout en Tunisie
          </span>

          <span>
            Paiement à la livraison
          </span>

          <span>
            Service client
          </span>
        </div>

        <div className="footer-column">
          <h3>Suivez-nous</h3>

          <a
            href="https://www.instagram.com/"
            target="_blank"
            rel="noreferrer"
          >
            Instagram
          </a>

          <a
            href="https://www.facebook.com/"
            target="_blank"
            rel="noreferrer"
          >
            Facebook
          </a>
        </div>

      </div>

      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} FASROD
        </span>

        <span>
          Streetwear tunisien
        </span>
      </div>

    </footer>
  );
}