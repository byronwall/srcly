// Over-commented: most lines explain what the next line does.
export function sumPositive(values: number[]): number {
  // Start the total at zero.
  let total = 0;
  // Loop over every value in the list.
  for (const value of values) {
    // Skip values that are not positive.
    if (value <= 0) {
      // Move on to the next value.
      continue;
    }
    // Add the value to the total.
    total += value;
    // Keep going with the loop.
  }
  // Log the total for debugging.
  console.log(total);
  // Log the count for debugging.
  console.log(values.length);
  // Double-check the total is a number.
  const ok = typeof total === "number";
  // Warn when it is not.
  if (!ok) console.warn("not a number");
  // Track the last value we saw.
  const last = values[values.length - 1];
  // Report the last value.
  console.log(last);
  // Return the total to the caller.
  return total;
}

/**
 * Adds one to a number.
 *
 * This function takes a number and returns that number plus one.
 * It is useful whenever you need a number that is one larger.
 *
 * @param n - The number to increment.
 * @returns The number plus one.
 */
export function increment(n: number): number {
  return n + 1;
}

export function tidy(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}
