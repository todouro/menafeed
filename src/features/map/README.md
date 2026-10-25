# SIGNAL geographic feature

A self-contained, offline-first **orthographic world globe** built with D3 Geo and SVG. Country and territorial-unit borders use Natural Earth world-scale polygons, supplemented by Natural Earth's tiny-country point layer for very small map units that cannot be drawn legibly as borders at this scale. A more detailed Bahrain geometry is preserved from the existing MENA dataset. The default camera is centered on MENA because this application focuses on regional news.

## Globe renderer

The globe uses D3 Geo's orthographic projection and bundled GeoJSON. The circular horizon, radial shading, graticule, and clipped country paths create a spherical view without requiring a WebGL context or a permanently running animation loop. Selecting a MENA country smoothly rotates and zooms the projection toward it; selecting it again animates back to the default MENA view. Switching countries retargets the current transition directly. Drag to rotate the sphere, scroll or use the controls to zoom, and use the arrow keys while the globe is focused to rotate the view. Camera transitions last about 540 ms and respect `prefers-reduced-motion`. The map remains offline after installation.

The bundled data contains 178 polygon country/territorial features plus 62 small-area point markers. Tiny countries and dependencies such as Monaco, Vatican City, Liechtenstein, and Singapore are shown by location markers when their borders are too small to distinguish on a whole-world view. Hover or focus these markers to read the place name. These markers are geographic locators, not representations of the microstate's full border geometry. Bahrain retains higher-resolution island geometry. MENA countries remain selectable for the existing news feed; other countries and territories appear as geographic context.

## Public API

The component continues to expose controlled or internal MENA selection, coordinate-backed markers, and marker activation callbacks. The selection callback receives a two-letter editorial MENA coverage code, or null when cleared. Markers require a stable identifier, label, longitude and latitude. Invalid coordinates are rejected; news markers on the globe's far hemisphere are hidden until the globe rotates to face them.

MenaGlobeDemo remains a standalone integration fixture. Its Manama marker is explicitly labelled as demo data and is not a news event.

## Geographic data and licensing

The main global boundaries use the Natural Earth 1:110m admin-0 country dataset from [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector). The small-area markers use [ne_50m_admin_0_tiny_countries.geojson](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_tiny_countries.geojson). Natural Earth data is public domain and generalized for global-scale use. The MENA coverage geometries retain the project's existing Natural Earth-derived boundaries from [datasets/geo-boundaries-world-110m](https://github.com/datasets/geo-boundaries-world-110m), and Bahrain uses a higher-resolution polygon supplement from [eFrane/admin0](https://github.com/eFrane/admin0), which declares CC0-1.0. See the attribution file.

The selection manifest contains 27 editorial entries, including Western Sahara, Palestine and Cyprus. Coverage is a product decision, not a declaration of sovereignty. Natural Earth-style cartography is generalized at small scales and represents cartographic administrative lines. Western Sahara, Israel/Palestine, Cyprus, Northern Cyprus, Somaliland and other contested areas may differ by source or scale. These boundaries are for geographic context and news visualization only, not legal, surveying, military, or diplomatic reference.

## Accessibility and interaction

- Drag to rotate; wheel and zoom buttons change scale; reset returns to the default MENA-centered view.
- Keyboard arrows rotate the focused globe, plus and minus zoom, Escape clears selection, and MENA country shapes remain keyboard-operable. Small-area marker dots are focusable and expose their names.
- Country boundaries and geographic data are bundled offline. There are no map tiles, runtime geodata downloads, or continuous animation loop.
- Motion transitions respect prefers-reduced-motion.
- The feature has no dependency on the news feature or app-shell state; it reuses the existing signal design tokens.

## Quality checks

Run the repository checks from the project root: npm ci, npm run typecheck, npm run lint, npm run format:check, npm run test, npm run build:web, and npm run check.

The Tauri/Rust checks are unaffected by this frontend-only change.
