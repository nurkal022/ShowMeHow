import type { Motif } from '../data';
import type { MotifProps } from './primitives';
import { Beam, Field, Flask, Globe, Orbit, Particles, Pendulum, Piston } from './motifs-apparatus';
import { ArrayScan, Curve, Population } from './motifs-structures';

/** Реестр мотивов. Раздел без мотива невозможен: ключ приходит из data.ts. */
export const MOTIFS: Record<Motif, (p: MotifProps) => React.ReactElement> = {
  pendulum: Pendulum,
  beam: Beam,
  piston: Piston,
  field: Field,
  particles: Particles,
  orbit: Orbit,
  flask: Flask,
  array: ArrayScan,
  curve: Curve,
  population: Population,
  globe: Globe,
};
