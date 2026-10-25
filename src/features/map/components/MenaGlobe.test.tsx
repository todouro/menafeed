import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MenaGlobe } from './MenaGlobe';
import type { MenaCountryCode, MenaMarker } from '../types';

function ControlledMap() {
  const [selectedCountry, setSelectedCountry] = useState<MenaCountryCode | null>(null);
  return <MenaGlobe selectedCountry={selectedCountry} onCountrySelect={setSelectedCountry} />;
}

describe('MenaGlobe', () => {
  beforeEach(() => {
    // Keep legacy interaction assertions deterministic; dedicated tests below
    // exercise the real requestAnimationFrame transition path.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('animates projection geometry and replaces a transition on rapid country changes', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames.delete(id);
    });

    render(<MenaGlobe />);
    const egypt = screen.getByRole('button', { name: 'Select Egypt' });
    const morocco = screen.getByRole('button', { name: 'Select Morocco' });
    const initialPath = egypt.getAttribute('d');

    fireEvent.click(egypt);
    expect(egypt.getAttribute('d')).toBe(initialPath);
    fireEvent.click(morocco);
    expect(egypt).toHaveAttribute('aria-pressed', 'false');
    expect(morocco).toHaveAttribute('aria-pressed', 'true');

    // Complete the currently scheduled frame, then its final frame.
    const runNextFrame = (time: number) => {
      const next = [...frames.entries()][0];
      expect(next).toBeDefined();
      frames.delete(next![0]);
      act(() => next![1](time));
    };
    runNextFrame(1000);
    runNextFrame(1540);

    expect(egypt.getAttribute('d')).not.toBe(initialPath);
    expect(morocco.getAttribute('d')).not.toBeNull();
  });
  it('selects a country through its geographic shape and reports it to the parent', () => {
    const onCountrySelect = vi.fn();
    render(<MenaGlobe onCountrySelect={onCountrySelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Bahrain' }));

    expect(onCountrySelect).toHaveBeenCalledWith('BH');
    const selection = screen.getByText('ACTIVE TERRITORY').parentElement;
    expect(selection).not.toBeNull();
    expect(within(selection!).getByText('Bahrain')).toBeInTheDocument();
  });

  it('supports keyboard country selection and a clear-selection action', () => {
    render(<ControlledMap />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Select Qatar' }), {
      key: 'Enter',
    });
    const selection = screen.getByText('ACTIVE TERRITORY').parentElement;
    expect(selection).not.toBeNull();
    expect(within(selection!).getByText('Qatar')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Clear selection/ }));
    expect(within(selection!).getByText('No country selected')).toBeInTheDocument();
  });

  it('resets the globe when the selected country is clicked again', () => {
    render(<MenaGlobe />);
    const selection = screen.getByText('ACTIVE TERRITORY').parentElement!;
    const egypt = screen.getByRole('button', { name: 'Select Egypt' });
    const initialPath = egypt.getAttribute('d');

    fireEvent.click(egypt);
    expect(within(selection).getByText('Egypt')).toBeInTheDocument();
    expect(egypt.getAttribute('d')).not.toBe(initialPath);

    fireEvent.click(egypt);
    expect(within(selection).getByText('No country selected')).toBeInTheDocument();
    expect(egypt.getAttribute('d')).toBe(initialPath);
  });

  it('toggles the current country off using keyboard activation', () => {
    render(<ControlledMap />);
    const qatar = screen.getByRole('button', { name: 'Select Qatar' });
    fireEvent.keyDown(qatar, { key: 'Enter' });
    const selection = screen.getByText('ACTIVE TERRITORY').parentElement!;
    expect(within(selection).getByText('Qatar')).toBeInTheDocument();
    fireEvent.keyDown(qatar, { key: 'Enter' });
    expect(within(selection).getByText('No country selected')).toBeInTheDocument();
  });

  it('toggles the current country off from the country list', () => {
    render(<ControlledMap />);
    const list = screen.getByLabelText('Choose a MENA country');
    const morocco = within(list).getByRole('button', { name: /Morocco/ });
    fireEvent.click(morocco);
    expect(morocco).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(morocco);
    expect(morocco).toHaveAttribute('aria-pressed', 'false');
  });

  it.each([
    ['Egypt', 'EG'],
    ['Saudi Arabia', 'SA'],
    ['Morocco', 'MA'],
  ])('focuses %s on the globe when selected', (name, code) => {
    render(<MenaGlobe />);
    const country = screen.getByRole('button', { name: `Select ${name}` });
    const initialPath = country.getAttribute('d');
    fireEvent.click(country);
    expect(country).toHaveAttribute('data-country-code', code);
    expect(country).toHaveAttribute('aria-pressed', 'true');
    expect(country.getAttribute('d')).not.toBe(initialPath);
  });

  it('rotates from a country shape without accidentally selecting it', () => {
    const onCountrySelect = vi.fn();
    render(<MenaGlobe onCountrySelect={onCountrySelect} />);
    const svg = screen.getByTestId('mena-map');
    const egypt = screen.getByRole('button', { name: 'Select Egypt' });
    const initialPath = egypt.getAttribute('d');
    fireEvent.pointerDown(egypt, { pointerId: 7, button: 0, clientX: 400, clientY: 200 });
    fireEvent.pointerMove(svg, { pointerId: 7, clientX: 450, clientY: 225 });
    fireEvent.pointerUp(svg, { pointerId: 7, clientX: 450, clientY: 225 });
    expect(egypt.getAttribute('d')).not.toBe(initialPath);
    fireEvent.click(egypt);
    expect(onCountrySelect).not.toHaveBeenCalled();
  });

  it('keeps the camera stable when hover state rerenders the globe', () => {
    render(<MenaGlobe />);
    const egypt = screen.getByRole('button', { name: 'Select Egypt' });
    fireEvent.click(egypt);
    const focusedPath = egypt.getAttribute('d');
    fireEvent.mouseEnter(egypt);
    expect(egypt.getAttribute('d')).toBe(focusedPath);
  });

  it('renders coordinate-backed markers and reports marker selection', () => {
    const onMarkerSelect = vi.fn();
    const manama: MenaMarker = {
      id: 'manama-example',
      label: 'Example marker · Manama',
      longitude: 50.5876,
      latitude: 26.2235,
      detail: 'Demonstration coordinate only',
    };
    const invalid: MenaMarker = {
      id: 'invalid-example',
      label: 'Invalid marker',
      longitude: 300,
      latitude: 91,
    };

    render(<MenaGlobe markers={[manama, invalid]} onMarkerSelect={onMarkerSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /Example marker · Manama/ }));

    expect(onMarkerSelect).toHaveBeenCalledWith(manama);
    expect(screen.queryByRole('button', { name: /Invalid marker/ })).not.toBeInTheDocument();
  });

  it('does not capture ordinary clicks but captures after drag movement', () => {
    const onCountrySelect = vi.fn();
    render(<MenaGlobe onCountrySelect={onCountrySelect} />);
    const svg = screen.getByTestId('mena-map');
    const country = screen.getByRole('button', { name: 'Select Bahrain' });
    const capture = vi.fn();
    Object.defineProperty(svg, 'setPointerCapture', { configurable: true, value: capture });

    fireEvent.pointerDown(country, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    expect(capture).not.toHaveBeenCalled();
    fireEvent.pointerUp(country, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.click(country);
    expect(onCountrySelect).toHaveBeenCalledWith('BH');

    fireEvent.pointerDown(country, { button: 0, pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 130, clientY: 100 });
    expect(capture).toHaveBeenCalledWith(2);
  });

  it('honors externally controlled selection rather than mutating it locally', () => {
    const onCountrySelect = vi.fn();
    render(<MenaGlobe selectedCountry="SA" onCountrySelect={onCountrySelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Bahrain' }));

    expect(onCountrySelect).toHaveBeenCalledWith('BH');
    const selection = screen.getByText('ACTIVE TERRITORY').parentElement;
    expect(selection).not.toBeNull();
    expect(within(selection!).getByText('Saudi Arabia')).toBeInTheDocument();
  });
});
