import { geoCentroid, geoDistance, geoGraticule, geoOrthographic, geoPath } from 'd3-geo';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, WheelEvent } from 'react';
import rawCountryData from '../data/world-countries.geojson?raw';
import { MENA_COUNTRIES, MENA_COUNTRY_CODES } from '../data/coverage';
import {
  isValidGeoCoordinate,
  MAP_HEIGHT,
  MAP_WIDTH,
  type CountryCollection,
  type CountryFeature,
} from '../geography';
import type { MenaGlobeProps, MenaMarker, MenaCountryCode } from '../types';
import './MenaGlobe.css';

interface GlobeView {
  longitude: number;
  latitude: number;
  zoom: number;
}

interface DragStart {
  pointerId: number;
  clientX: number;
  clientY: number;
  longitude: number;
  latitude: number;
  zoom: number;
}

const INITIAL_VIEW: GlobeView = { longitude: 24, latitude: 27, zoom: 1 };
const MIN_ZOOM = 0.82;
const MAX_ZOOM = 1.62;
const GLOBE_RADIUS = 284;
const CENTER_X = MAP_WIDTH / 2;
const CENTER_Y = MAP_HEIGHT / 2;
const WORLD_FEATURES = JSON.parse(rawCountryData) as CountryCollection;
const COUNTRY_FEATURES = WORLD_FEATURES.features as CountryFeature[];
const WORLD_POLYGON_COUNT = COUNTRY_FEATURES.filter(
  ({ geometry }) => geometry.type !== 'Point',
).length;
const SMALL_AREA_MARKER_COUNT = COUNTRY_FEATURES.length - WORLD_POLYGON_COUNT;
const GRATICULE = geoGraticule().step([15, 15])();

function createGlobeProjection(view: GlobeView) {
  return geoOrthographic()
    .translate([CENTER_X, CENTER_Y])
    .scale(GLOBE_RADIUS * view.zoom)
    .rotate([-view.longitude, -view.latitude, 0])
    .clipAngle(90);
}

function normalizeLongitude(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function clampLatitude(value: number): number {
  return Math.max(-78, Math.min(78, value));
}

function formatCoordinate(value: number, axis: 'latitude' | 'longitude'): string {
  const hemisphere = axis === 'latitude' ? (value < 0 ? 'S' : 'N') : value < 0 ? 'W' : 'E';
  return Math.abs(value).toFixed(2) + '° ' + hemisphere;
}

function isCountryCode(value: string): value is MenaCountryCode {
  return MENA_COUNTRY_CODES.has(value);
}

function validMarker(marker: MenaMarker): boolean {
  return (
    marker.id.trim().length > 0 &&
    marker.label.trim().length > 0 &&
    isValidGeoCoordinate(marker.longitude, marker.latitude)
  );
}

function isFacingCamera(marker: MenaMarker, view: GlobeView): boolean {
  return (
    geoDistance([marker.longitude, marker.latitude], [view.longitude, view.latitude]) <=
    Math.PI / 2 + 0.000001
  );
}

/**
 * A bundled, offline-first orthographic globe. All world boundaries are rendered;
 * country selection remains limited to the app's editorial MENA coverage.
 */
export function MenaGlobe({
  selectedCountry,
  onCountrySelect,
  markers = [],
  onMarkerSelect,
  className,
  ariaLabel = 'Interactive world globe with selectable Middle East and North Africa countries',
}: MenaGlobeProps) {
  const instanceId = useId().replace(/:/g, '');
  const sphereGradientId = 'signal-globe-sphere-' + instanceId;
  const highlightGradientId = 'signal-globe-highlight-' + instanceId;
  const glowGradientId = 'signal-globe-glow-' + instanceId;
  const clipId = 'signal-globe-clip-' + instanceId;
  const [internalSelection, setInternalSelection] = useState<MenaCountryCode | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [view, setView] = useState<GlobeView>(INITIAL_VIEW);
  const dragStartRef = useRef<DragStart | null>(null);
  const didDragRef = useRef(false);

  const isControlled = selectedCountry !== undefined;
  const activeCountry = isControlled ? selectedCountry : internalSelection;
  const radius = GLOBE_RADIUS * view.zoom;

  const projection = useMemo(() => createGlobeProjection(view), [view]);
  const paths = useMemo(() => {
    const pathGenerator = geoPath(projection);
    return COUNTRY_FEATURES.map((feature) => ({
      feature,
      path: pathGenerator(feature) ?? '',
    })).filter(({ path }) => path.length > 0);
  }, [projection]);
  const graticulePath = useMemo(() => geoPath(projection)(GRATICULE) ?? '', [projection]);
  const visibleMarkers = useMemo(
    () =>
      markers
        .filter(validMarker)
        .filter((marker) => isFacingCamera(marker, view))
        .map((marker) => ({ marker, position: projection([marker.longitude, marker.latitude]) }))
        .filter(
          (entry): entry is { marker: MenaMarker; position: [number, number] } =>
            entry.position !== null && entry.position.every(Number.isFinite),
        ),
    [markers, projection, view],
  );

  const selectCountry = useCallback(
    (country: MenaCountryCode | null) => {
      // Preserve the existing navigation contract: selecting an active country
      // again clears it, including in the externally controlled mode.
      const next = country === activeCountry ? null : country;
      if (!isControlled) setInternalSelection(next);
      onCountrySelect?.(next);
    },
    [activeCountry, isControlled, onCountrySelect],
  );

  useEffect(() => {
    // Keep the selected country near the globe centre; this works for both
    // controlled selection and the internal selection list.
    if (!activeCountry) {
      setView(INITIAL_VIEW);
      return;
    }
    const feature = COUNTRY_FEATURES.find((item) => item.properties.code === activeCountry);
    if (!feature) return;
    const [longitude, latitude] = geoCentroid(feature);
    if (!isValidGeoCoordinate(longitude, latitude)) return;
    setView((current) => ({
      longitude: normalizeLongitude(longitude),
      latitude: clampLatitude(latitude),
      zoom: Math.max(current.zoom, 1.14),
    }));
  }, [activeCountry]);

  const currentCountry = MENA_COUNTRIES.find(({ code }) => code === activeCountry);
  const hoveredFeature = hoveredCountry
    ? COUNTRY_FEATURES.find(({ properties }) => properties.code === hoveredCountry)
    : undefined;
  const mapClassName = ['signal-map', className].filter(Boolean).join(' ');

  const startPan = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return;
      if ((event.target as Element).closest('[data-marker-id]')) return;

      dragStartRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        longitude: view.longitude,
        latitude: view.latitude,
        zoom: view.zoom,
      };
      didDragRef.current = false;
      // Do not capture on pointer-down: ordinary clicks must still reach
      // nested country paths. Capture only after an actual drag begins.
    },
    [view.latitude, view.longitude, view.zoom],
  );

  const movePan = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.clientX;
    const deltaY = event.clientY - start.clientY;
    if (Math.hypot(deltaX, deltaY) > 4 && !didDragRef.current) {
      didDragRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (!didDragRef.current) return;

    const degreesPerPixel = 90 / (GLOBE_RADIUS * start.zoom);
    setView({
      longitude: normalizeLongitude(start.longitude - deltaX * degreesPerPixel),
      latitude: clampLatitude(start.latitude + deltaY * degreesPerPixel),
      zoom: start.zoom,
    });
  }, []);

  const endPan = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.clientX;
    const deltaY = event.clientY - start.clientY;
    if (Math.hypot(deltaX, deltaY) > 4) {
      didDragRef.current = true;
      const degreesPerPixel = 90 / (GLOBE_RADIUS * start.zoom);
      setView({
        longitude: normalizeLongitude(start.longitude - deltaX * degreesPerPixel),
        latitude: clampLatitude(start.latitude + deltaY * degreesPerPixel),
        zoom: start.zoom,
      });
    }

    dragStartRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const zoomAt = useCallback((factor: number) => {
    setView((current) => ({
      ...current,
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom * factor)),
    }));
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      zoomAt(Math.exp(-event.deltaY * 0.0012));
    },
    [zoomAt],
  );

  const handleMapKeyDown = useCallback(
    (event: KeyboardEvent<SVGSVGElement>) => {
      if (event.key === 'Escape') {
        selectCountry(null);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomAt(1.2);
      } else if (event.key === '-') {
        event.preventDefault();
        zoomAt(1 / 1.2);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setView((current) => ({
          ...current,
          longitude: normalizeLongitude(current.longitude - 10),
        }));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setView((current) => ({
          ...current,
          longitude: normalizeLongitude(current.longitude + 10),
        }));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setView((current) => ({
          ...current,
          latitude: clampLatitude(current.latitude + 10),
        }));
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setView((current) => ({
          ...current,
          latitude: clampLatitude(current.latitude - 10),
        }));
      }
    },
    [selectCountry, zoomAt],
  );

  return (
    <section className={mapClassName} aria-label={ariaLabel}>
      <header className="signal-map__header">
        <div>
          <p className="signal-map__eyebrow">GEOGRAPHIC INTELLIGENCE / 01</p>
          <h2 className="signal-map__heading">Global context</h2>
        </div>
        <div className="signal-map__header-actions">
          <span className="signal-map__coverage-count">
            {WORLD_POLYGON_COUNT} POLYGON FEATURES / {SMALL_AREA_MARKER_COUNT} SMALL-AREA MARKERS
          </span>
          <button
            className="signal-map__clear"
            type="button"
            onClick={() => selectCountry(null)}
            disabled={activeCountry === null}
          >
            Clear selection <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      <div className="signal-map__stage">
        <div className="signal-map__stage-meta" aria-hidden="true">
          <span>ORTHOGRAPHIC / WGS84</span>
          <span>{hoveredFeature?.properties.name ?? 'WORLD / COUNTRY BOUNDARIES'}</span>
        </div>
        <svg
          className="signal-map__svg"
          viewBox={'0 0 ' + MAP_WIDTH + ' ' + MAP_HEIGHT}
          role="region"
          aria-label={ariaLabel}
          tabIndex={0}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onWheel={handleWheel}
          onKeyDown={handleMapKeyDown}
          data-testid="mena-map"
        >
          <defs>
            <radialGradient id={sphereGradientId} cx="31%" cy="24%" r="79%">
              <stop offset="0%" stopColor="#183033" />
              <stop offset="54%" stopColor="#0b171a" />
              <stop offset="100%" stopColor="#030708" />
            </radialGradient>
            <radialGradient id={highlightGradientId} cx="27%" cy="17%" r="75%">
              <stop offset="0%" stopColor="#b5e6b2" stopOpacity="0.16" />
              <stop offset="56%" stopColor="#a5d4bd" stopOpacity="0.035" />
              <stop offset="100%" stopColor="#a5d4bd" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={glowGradientId} cx="50%" cy="50%" r="50%">
              <stop offset="65%" stopColor="#5c9e7c" stopOpacity="0.13" />
              <stop offset="100%" stopColor="#5c9e7c" stopOpacity="0" />
            </radialGradient>
            <clipPath id={clipId}>
              <circle cx={CENTER_X} cy={CENTER_Y} r={radius} />
            </clipPath>
          </defs>

          <rect
            className="signal-map__background"
            x="0"
            y="0"
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
          />
          <circle
            className="signal-map__sphere-glow"
            cx={CENTER_X}
            cy={CENTER_Y}
            r={radius + 34}
            fill={'url(#' + glowGradientId + ')'}
          />
          <circle
            className="signal-map__sphere-base"
            cx={CENTER_X}
            cy={CENTER_Y}
            r={radius}
            fill={'url(#' + sphereGradientId + ')'}
          />
          <circle
            className="signal-map__sphere-highlight"
            cx={CENTER_X}
            cy={CENTER_Y}
            r={radius}
            fill={'url(#' + highlightGradientId + ')'}
          />

          <g clipPath={'url(#' + clipId + ')'}>
            <path className="signal-map__graticule" d={graticulePath} aria-hidden="true" />
            <g data-testid="map-layer">
              {paths.map(({ feature, path }) => {
                const { code, name, selectable } = feature.properties;
                const countryCode = isCountryCode(code) ? code : null;
                const canSelect = selectable && countryCode !== null;
                const selected = canSelect && activeCountry === countryCode;
                const hovered = hoveredCountry === code;

                return (
                  <path
                    key={code}
                    d={path}
                    className={[
                      'signal-map__country',
                      canSelect
                        ? 'signal-map__country--selectable'
                        : 'signal-map__country--context',
                      selected ? 'signal-map__country--selected' : '',
                      hovered ? 'signal-map__country--hovered' : '',
                      feature.geometry.type === 'Point' ? 'signal-map__country--point' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-country-code={code}
                    data-geometry-type={feature.geometry.type}
                    role={
                      canSelect ? 'button' : feature.geometry.type === 'Point' ? 'img' : undefined
                    }
                    tabIndex={canSelect || feature.geometry.type === 'Point' ? 0 : undefined}
                    aria-label={
                      canSelect
                        ? 'Select ' + name
                        : feature.geometry.type === 'Point'
                          ? name + ' · small-area marker'
                          : undefined
                    }
                    aria-pressed={canSelect ? selected : undefined}
                    onClick={
                      canSelect && countryCode
                        ? () => {
                            if (didDragRef.current) {
                              didDragRef.current = false;
                              return;
                            }
                            selectCountry(countryCode);
                          }
                        : undefined
                    }
                    onKeyDown={
                      canSelect && countryCode
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              selectCountry(countryCode);
                            }
                          }
                        : undefined
                    }
                    onMouseEnter={() => setHoveredCountry(code)}
                    onMouseLeave={() => setHoveredCountry(null)}
                    onFocus={() => setHoveredCountry(code)}
                    onBlur={() => setHoveredCountry(null)}
                  >
                    <title>{canSelect ? name + ' · select country' : name}</title>
                  </path>
                );
              })}
              {visibleMarkers.map(({ marker, position }) => (
                <g
                  key={marker.id}
                  className="signal-map__marker"
                  data-marker-id={marker.id}
                  role={onMarkerSelect ? 'button' : 'img'}
                  tabIndex={onMarkerSelect ? 0 : undefined}
                  aria-label={
                    marker.label +
                    ', ' +
                    formatCoordinate(marker.latitude, 'latitude') +
                    ', ' +
                    formatCoordinate(marker.longitude, 'longitude')
                  }
                  onClick={() => {
                    if (didDragRef.current) {
                      didDragRef.current = false;
                      return;
                    }
                    onMarkerSelect?.(marker);
                  }}
                  onKeyDown={(event) => {
                    if (onMarkerSelect && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onMarkerSelect(marker);
                    }
                  }}
                >
                  <circle
                    cx={position[0]}
                    cy={position[1]}
                    r="12"
                    className="signal-map__marker-halo"
                  />
                  <circle
                    cx={position[0]}
                    cy={position[1]}
                    r="3.5"
                    className="signal-map__marker-dot"
                  />
                  <title>
                    {marker.label} · {formatCoordinate(marker.latitude, 'latitude')},{' '}
                    {formatCoordinate(marker.longitude, 'longitude')}
                    {marker.detail ? ' · ' + marker.detail : ''}
                  </title>
                </g>
              ))}
            </g>
          </g>

          <circle
            className="signal-map__sphere-outline"
            cx={CENTER_X}
            cy={CENTER_Y}
            r={radius}
            aria-hidden="true"
          />
          <text x="28" y="34" className="signal-map__corner-label">
            WORLD / NATURAL EARTH
          </text>
          <text x="972" y="34" textAnchor="end" className="signal-map__corner-label">
            DRAG TO ROTATE
          </text>
          <text x="28" y="617" className="signal-map__coordinate-label">
            GLOBAL / 110M REFERENCE
          </text>
          <text x="972" y="617" textAnchor="end" className="signal-map__coordinate-label">
            SELECTABLE MENA COVERAGE
          </text>
        </svg>

        <div className="signal-map__zoom-controls" aria-label="Globe navigation controls">
          <button type="button" onClick={() => zoomAt(1.2)} aria-label="Zoom in">
            <ZoomIn size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => zoomAt(1 / 1.2)} aria-label="Zoom out">
            <ZoomOut size={18} aria-hidden="true" />
          </button>
          <span aria-hidden="true" />
          <button
            type="button"
            onClick={() => {
              didDragRef.current = false;
              setView(INITIAL_VIEW);
            }}
            aria-label="Reset globe view"
          >
            <RotateCcw size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="signal-map__stage-hint" aria-hidden="true">
          Drag to rotate <span>·</span> Scroll to zoom <span>·</span> Select a MENA country
        </div>
      </div>

      <div className="signal-map__selection" aria-live="polite" aria-atomic="true">
        <div>
          <span className="signal-map__selection-label">ACTIVE TERRITORY</span>
          <span className="signal-map__selection-value">
            {currentCountry ? currentCountry.name : 'No country selected'}
          </span>
        </div>
        {activeCountry && <span className="signal-map__country-code">{activeCountry}</span>}
      </div>

      <div className="signal-map__country-panel">
        <div className="signal-map__country-panel-heading">
          <span>SELECT BY COUNTRY</span>
          <span>{MENA_COUNTRIES.length.toString().padStart(2, '0')} MENA AVAILABLE</span>
        </div>
        <div className="signal-map__country-list" aria-label="Choose a MENA country">
          {MENA_COUNTRIES.map(({ code, name }) => (
            <button
              key={code}
              type="button"
              className={[
                'signal-map__country-option',
                activeCountry === code ? 'signal-map__country-option--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={activeCountry === code}
              onClick={() => selectCountry(code)}
            >
              <span>{name}</span>
              <span className="signal-map__country-option-code">{code}</span>
            </button>
          ))}
        </div>
      </div>

      <footer className="signal-map__footer">
        <span>
          <i aria-hidden="true" /> WORLD COUNTRY BOUNDARIES / NATURAL EARTH 1:110M
        </span>
        <span>GEOGRAPHIC DATA BUNDLED OFFLINE</span>
      </footer>
    </section>
  );
}
