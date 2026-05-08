import { useEffect, useRef, useState } from "react";
import "./App.css";
import Beams from "./components/Beams";

const photos = [
  { id: 1, src: "/images/photo-1.webp", alt: "Project 1" },
  { id: 2, src: "/images/photo-2.webp", alt: "Project 2" },
  { id: 3, src: "/images/photo-3.webp", alt: "Project 3" },
  { id: 4, src: "/images/photo-4.webp", alt: "Project 4" },
  { id: 5, src: "/images/photo-5.webp", alt: "Project 5" },
  { id: 6, src: "/images/photo-6.webp", alt: "Project 6" },
  { id: 7, src: "/images/photo-7.webp", alt: "Project 7" },
  { id: 8, src: "/images/photo-8.webp", alt: "Project 8" },
  { id: 9, src: "/images/photo-9.webp", alt: "Project 9" },
  { id: 10, src: "/images/photo-10.webp", alt: "Project 10" },
  { id: 13, src: "/images/photo-13.webp", alt: "Project 13" },
  { id: 12, src: "/images/photo-12.webp", alt: "Project 12" },
  { id: 14, src: "/images/photo-14.webp", alt: "Project 14" },
];

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const gridRef = useRef(null);
  const aboutRef = useRef(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    function resizeMasonry() {
      const gap = parseFloat(getComputedStyle(grid).gap);
      const items = grid.children;
      grid.style.gridAutoRows = "1px";

      Promise.all(
        Array.from(items).map((item) => {
          return new Promise((resolve) => {
            const img = item.querySelector("img");

            if (!img) {
              resolve();
              return;
            }

            if (img.complete) {
              resolve();
            } else {
              img.onload = resolve;
              img.onerror = resolve;
            }
          });
        })
      ).then(() => {
        for (let item of items) {
          const img = item.querySelector("img");
          if (!img) continue;

          const rowSpan = Math.ceil((img.offsetHeight + gap) / (1 + gap));
          item.style.gridRowEnd = `span ${rowSpan}`;
        }
      });
    }

    function checkVisibleItems() {
      document.querySelectorAll(".photo-item").forEach((item) => {
        const rect = item.getBoundingClientRect();

        if (rect.top < window.innerHeight) {
          item.classList.add("visible");
        }
      });
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              entry.target.classList.add("visible");
            }, 100);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -100px 0px",
      }
    );

    document.querySelectorAll(".photo-item").forEach((item) => {
      observer.observe(item);
    });

    resizeMasonry();
    setTimeout(resizeMasonry, 500);
    setTimeout(checkVisibleItems, 100);

    window.addEventListener("load", resizeMasonry);
    window.addEventListener("resize", resizeMasonry);

    return () => {
      observer.disconnect();
      window.removeEventListener("load", resizeMasonry);
      window.removeEventListener("resize", resizeMasonry);
    };
  }, []);

  useEffect(() => {
    function handleScroll() {
      if (window.scrollY > 500) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    }

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    function handleDocumentClick(event) {
      if (
        aboutRef.current &&
        !aboutRef.current.contains(event.target) &&
        !event.target.classList.contains("about-link")
      ) {
        setAboutOpen(false);
      }
    }

    document.addEventListener("click", handleDocumentClick);

    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  function handleMenuClick(event) {
    event.preventDefault();
    setMenuOpen((current) => !current);
  }

  function handleOverlayClick(event) {
    if (event.target.classList.contains("menu-overlay")) {
      setMenuOpen(false);
    }
  }

  function handleAboutClick(event) {
    event.preventDefault();
    setAboutOpen(true);
    setMenuOpen(false);
  }

  function handleBackToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  return (
    <>
      <div className="site-background">
        <Beams
          beamWidth={1.1}
          beamHeight={25}
          beamNumber={34}
          lightColor="#ffffff"
          speed={6.6}
          noiseIntensity={2.45}
          scale={0.21}
          rotation={36}
        />
      </div>
      <header className="header">
        <a
          href="#"
          className={`menu-trigger ${menuOpen ? "active" : ""}`}
          aria-label="Open Menu"
          onClick={handleMenuClick}
        >
          <span className="menu-text">Sajal</span>
          <span className="close-icon" aria-hidden="true">
            ×
          </span>
        </a>
      </header>

      <div
        className={`menu-overlay ${menuOpen ? "active" : ""}`}
        role="dialog"
        aria-modal="true"
        onClick={handleOverlayClick}
      >
        <nav className="menu-content">
          <a href="#" className="about-link" onClick={handleAboutClick}>
            About
          </a>
          <a href="#contact">Contact</a>
          <a
            href="https://instagram.com/yourusername"
            target="_blank"
            rel="noreferrer"
            className="instagram-link"
          >
            <i className="fab fa-instagram" aria-hidden="true"></i>
            Instagram
          </a>
        </nav>
      </div>

      <div
        ref={aboutRef}
        className={`about-content ${aboutOpen ? "active" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <h2>About Me</h2>
        <p>
          I am a passionate hobbyist who loves photography. I like doing
          portrait and event photoshoots. Contact me if you want to get in
          touch.
        </p>
      </div>

      <main>
        <section className="grid" ref={gridRef}>
          {photos.map((photo) => (
            <article className="photo-item" key={photo.id}>
              <img src={photo.src} alt={photo.alt} loading="lazy" />
            </article>
          ))}
        </section>
      </main>

      <footer className="copyright">
        © 2023 Sajal. All images are protected by copyright.
      </footer>

      <div
        className={`back-to-top ${showBackToTop ? "visible" : ""}`}
        aria-label="Back to Top"
        onClick={handleBackToTop}
      >
        ↑
      </div>
    </>
  );
}

export default App;
