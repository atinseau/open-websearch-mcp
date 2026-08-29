export function tooDeep(one: boolean, two: boolean, three: boolean, four: boolean, five: boolean): number {
  if (one) {
    if (two) {
      if (three) {
        if (four) {
          if (five) return 1;
        }
      }
    }
  }
  return 0;
}
