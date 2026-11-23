// BaseCity Docs page controller: mounts shared site nav/footer, sticky TOC active state & code copy buttons.
import { mountSite } from './site.js';

mountSite('docs');

const links = [...document.querySelectorAll('.doc-toc a[href^="#"]')];
const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);

if (sections.length && 'IntersectionObserver' in window) {
  const obs = new IntersectionObserver(
    (entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!vis) return;
      const id = `#${vis.target.id}`;
      links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === id));
    },
    { rootMargin: '-84px 0px -65% 0px', threshold: 0 },
  );
  sections.forEach((s) => obs.observe(s));
}

document.querySelectorAll('pre.doc-code').forEach((pre) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'doc-copy';
  btn.textContent = 'Copy';
  btn.onclick = async () => {
    const code = pre.querySelector('code')?.textContent || '';
    try {
      await navigator.clipboard.writeText(code);
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    } catch {
      btn.textContent = 'Failed';
    }
  };
  pre.appendChild(btn);
});
