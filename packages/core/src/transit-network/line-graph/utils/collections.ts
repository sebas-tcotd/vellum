/** Gets an existing value from a map, or computes, stores, and returns a new one if missing. */
export function getOrCreate<K, V>(
  map: Map<K, V>,
  key: K,
  factory: (key: K) => V,
): V {
  if (map.has(key)) {
    return map.get(key)!;
  }

  const newValue = factory(key);
  map.set(key, newValue);

  return newValue;
}
