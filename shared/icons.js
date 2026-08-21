// Delte inline SVG-ikoner — 1.5px stroke, currentColor, 24×24 viewBox.
// String-konkatenering med '+', ingen template literals (se koderegler).

function moelleIkonTjek(klasse){
  return '<svg class="moelle-ikon ' + (klasse || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 12.5L9.5 18L20 6"></path>' +
    '</svg>';
}

function moelleIkonKryds(klasse){
  return '<svg class="moelle-ikon ' + (klasse || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6 6L18 18M18 6L6 18"></path>' +
    '</svg>';
}

function moelleIkonStreg(klasse){
  return '<svg class="moelle-ikon ' + (klasse || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M5 12H19"></path>' +
    '</svg>';
}

function moelleIkonTavle(klasse){
  return '<svg class="moelle-ikon ' + (klasse || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="5" y="4" width="14" height="17" rx="2"></rect>' +
    '<path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"></path>' +
    '<path d="M8 10h8M8 14h8M8 18h5"></path>' +
    '</svg>';
}

function moelleIkonApp(klasse){
  return '<svg class="moelle-ikon ' + (klasse || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="6" y="2" width="12" height="20" rx="2"></rect>' +
    '<path d="M11 18h2"></path>' +
    '</svg>';
}

function moelleIkonSkaerm(klasse){
  return '<svg class="moelle-ikon ' + (klasse || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="4" width="18" height="13" rx="2"></rect>' +
    '<path d="M8 21h8M12 17v4"></path>' +
    '</svg>';
}
