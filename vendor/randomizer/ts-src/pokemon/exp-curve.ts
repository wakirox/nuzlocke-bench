export enum ExpCurve {
  SLOW,
  MEDIUM_SLOW,
  MEDIUM_FAST,
  FAST,
  ERRATIC,
  FLUCTUATING,
}

export function expCurveFromByte(curve: number): ExpCurve | null {
  switch (curve) {
    case 0:
      return ExpCurve.MEDIUM_FAST;
    case 1:
      return ExpCurve.ERRATIC;
    case 2:
      return ExpCurve.FLUCTUATING;
    case 3:
      return ExpCurve.MEDIUM_SLOW;
    case 4:
      return ExpCurve.FAST;
    case 5:
      return ExpCurve.SLOW;
    default:
      return null;
  }
}

export function expCurveToByte(curve: ExpCurve): number {
  switch (curve) {
    case ExpCurve.SLOW:
      return 5;
    case ExpCurve.MEDIUM_SLOW:
      return 3;
    case ExpCurve.MEDIUM_FAST:
      return 0;
    case ExpCurve.FAST:
      return 4;
    case ExpCurve.ERRATIC:
      return 1;
    case ExpCurve.FLUCTUATING:
      return 2;
  }
}

export function expCurveToString(curve: ExpCurve): string {
  switch (curve) {
    case ExpCurve.MEDIUM_FAST:
      return "Medium Fast";
    case ExpCurve.ERRATIC:
      return "Erratic";
    case ExpCurve.FLUCTUATING:
      return "Fluctuating";
    case ExpCurve.MEDIUM_SLOW:
      return "Medium Slow";
    case ExpCurve.FAST:
      return "Fast";
    case ExpCurve.SLOW:
      return "Slow";
  }
}
