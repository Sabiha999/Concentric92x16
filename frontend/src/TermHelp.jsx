import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const definitions = {
  ra: ['Right ascension (RA)', 'Like longitude on a sky map. It tells you how far around the sky to go, from 0° to just under 360°.'],
  dec: ['Declination (Dec)', 'Like latitude on a sky map. 0° is the sky’s equator. Positive values are north and negative values are south.'],
  radius: ['Search radius', 'How far out from the chosen sky position to search. A larger radius makes a bigger search circle. 0.01° is 36 arcseconds.'],
  release: ['SPHEREx release', 'A set of telescope images published together. Data Release 1 (DR1) reprocesses the first two sky surveys. Quick Release 3 (QR3) includes images from surveys 3 and 4. Deep fields are parts of the sky observed more often.'],
  resolver: ['Object name lookup', 'Looks up a known object’s name to fill in its sky coordinates. You can then search that region for telescope images.'],
  wise: ['WISE 0855', 'A cold brown dwarf, an object too small to shine like a star. This demo opens saved SPHEREx observations of its region.'],
  navigator: ['Celestial sky navigator', 'An interactive map of the sky. Pan and zoom to explore, then use the map center as your search position.'],
  icrs: ['ICRS', 'The standard coordinate grid used to give objects an address on the sky. The map can show that address in hours and degrees or in decimal degrees.'],
  irsa: ['IRSA', 'NASA’s infrared astronomy archive at IPAC, where the app looks for SPHEREx observations.'],
  survey: ['Background survey', 'A sky map made from many telescope images. DSS2 shows visible light. 2MASS shows near-infrared light, just beyond what our eyes can see.'],
  gaia: ['Gaia DR3 catalog overlay', 'Gaia’s third data release lists objects and where they are in the sky. The app draws markers for the entries it finds over your sky map.'],
  epoch: ['Position epoch', 'The reference date for a catalog’s coordinates. Stars can move over time, so the same object’s coordinates can change. J2016.0 is Gaia DR3’s reference date.'],
  magnitude: ['G magnitude', 'How bright an object appears through Gaia’s broad light filter. Smaller numbers mean brighter objects.'],
  observation: ['Observation', 'A record of the telescope looking at a patch of sky. The same patch can have several records from different times or parts of the instrument.'],
  utc: ['UTC', 'A common time standard used to report when each observation happened.'],
  detector: ['Detector', 'The part of the telescope instrument that records light. Labels such as D3 identify which detector took the image.'],
  fits: ['FITS', 'An astronomy file format that can store measured brightness values and information about where each image pixel is on the sky.'],
  cutout: ['Infrared cutout', 'A small crop from a larger telescope image, centered on the region you chose. Infrared light has wavelengths beyond visible red.'],
  peaks: ['Source detection', 'Looks for bright spots in the image. A marked spot might be a real object, noise, or an image flaw.'],
  simbad: ['SIMBAD', 'A database of known astronomical objects. Searching near a bright spot can suggest possible identities.'],
  arcsecond: ['Arcsecond (″)', 'A small unit for distances on a sky map. One degree contains 3,600 arcseconds.'],
  alignment: ['Image alignment', 'Lines up two images using their sky coordinates so that the same sky position appears at the same place in both.'],
  blink: ['Blink', 'Switches between two aligned images so changes in position or appearance are easier to spot.'],
  overlay: ['Image overlay', 'Stacks one aligned image on top of the other. Use the opacity slider to control how much of the top image you can see.'],
  wavelength: ['Wavelength (µm)', 'The distance between two wave crests. It describes the kind of light measured. A micrometre (µm) is one millionth of a metre.'],
  bandwidth: ['Bandwidth (µm)', 'How wide a range of wavelengths contributes to a measurement.'],
  brightness: ['Surface brightness (MJy/sr)', 'How much light comes from a patch of sky per unit of sky area. The number here includes any background light in the pixel.'],
  sample: ['Spectral samples', 'Individual brightness readings at different wavelengths taken near the same sky position. A few samples give a quick look at how brightness varies with wavelength.'],
};

export default function TermHelp({ term }) {
  const [label, description] = definitions[term];
  const id = useId();
  const trigger = useRef(null);
  const bubble = useRef(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open) return undefined;
    function place() {
      const anchor = trigger.current.getBoundingClientRect();
      const tip = bubble.current;
      const left = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, anchor.left));
      const above = anchor.bottom + tip.offsetHeight > window.innerHeight - 8
        && anchor.top >= tip.offsetHeight + 8;
      tip.style.left = left + 'px';
      tip.style.top = (above ? anchor.top - tip.offsetHeight : anchor.bottom) + 'px';
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function dismissOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    function dismissOutside(event) {
      if (!trigger.current.contains(event.target) && !bubble.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('keydown', dismissOnEscape);
    document.addEventListener('pointerdown', dismissOutside);
    return () => {
      document.removeEventListener('keydown', dismissOnEscape);
      document.removeEventListener('pointerdown', dismissOutside);
    };
  }, [open]);

  function leave(event) {
    if (event.pointerType !== 'mouse' || document.activeElement === trigger.current) return;
    const next = event.relatedTarget;
    if (next instanceof Node && (bubble.current?.contains(next) || trigger.current.contains(next))) return;
    setOpen(false);
  }

  return <span className="term-help">
    <button ref={trigger} type="button" className="term-help-trigger"
      aria-label={`Explain ${label}`} aria-describedby={id}
      onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true); }}
      onPointerLeave={leave} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onClick={() => setOpen(true)}>?</button>
    {createPortal(<span id={id} ref={bubble} className="term-help-bubble" role="tooltip"
      hidden={!open} onPointerLeave={leave}>{description}</span>, document.body)}
  </span>;
}

export function FieldLabel({ id, term, children }) {
  return <div className="field-label"><label htmlFor={id}>{children}</label><TermHelp term={term} /></div>;
}
