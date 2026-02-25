document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-confirm]').forEach((el) => {
    el.addEventListener('click', (event) => {
      const message = el.getAttribute('data-confirm') || '진행할까요?';
      if (!window.confirm(message)) {
        event.preventDefault();
      }
    });
  });

  const dandelionField = document.querySelector('[data-dandelion-field]');
  if (dandelionField) {
    const totalSeeds = prefersReducedMotion ? 20 : 56;
    const whiteCount = Math.round(totalSeeds * 0.75);
    const yellowCount = totalSeeds - whiteCount;
    const colorPool = [
      ...Array.from({ length: whiteCount }, () => 'is-white'),
      ...Array.from({ length: yellowCount }, () => 'is-yellow'),
    ];

    for (let i = colorPool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [colorPool[i], colorPool[j]] = [colorPool[j], colorPool[i]];
    }

    const rand = (min, max) => Math.random() * (max - min) + min;
    dandelionField.replaceChildren();

    colorPool.forEach((toneClass) => {
      const seed = document.createElement('span');
      seed.className = `about-dandelion-seed ${toneClass}`;
      seed.style.setProperty('--seed-size', `${rand(9, 22).toFixed(2)}px`);
      seed.style.setProperty('--seed-x', `${rand(-8, 104).toFixed(2)}%`);
      seed.style.setProperty('--seed-y', `${rand(-6, 102).toFixed(2)}%`);
      seed.style.setProperty('--drift-x', `${rand(-110, 110).toFixed(1)}px`);
      seed.style.setProperty('--drift-y', `${rand(-140, 96).toFixed(1)}px`);
      seed.style.setProperty('--seed-spin', `${rand(-150, 150).toFixed(1)}deg`);
      seed.style.setProperty('--seed-tilt', `${rand(-22, 22).toFixed(1)}deg`);
      seed.style.setProperty('--seed-duration', `${rand(10, 24).toFixed(2)}s`);
      seed.style.setProperty('--seed-delay', `${rand(-24, 0).toFixed(2)}s`);
      dandelionField.appendChild(seed);
    });
  }

  const revealTargets = Array.from(document.querySelectorAll('[data-reveal]'));
  if (revealTargets.length > 0) {
    const showElement = (element) => {
      const delay = Number(element.dataset.revealDelay || 0);
      if (delay > 0) {
        window.setTimeout(() => {
          element.classList.add('is-visible');
        }, delay);
        return;
      }
      element.classList.add('is-visible');
    };

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      revealTargets.forEach(showElement);
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          showElement(entry.target);
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.22 }
    );

    revealTargets.forEach((item) => observer.observe(item));
  }
});
