export type Ranked<T> = { value: T; score: number }

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

function grams(value: string) {
  const chars = [...normalize(value)]
  const result: string[] = []
  for (let size = 1; size <= 3; size += 1) {
    for (let index = 0; index <= chars.length - size; index += 1) result.push(chars.slice(index, index + size).join(''))
  }
  return result
}

function vector(value: string) {
  const counts = new Map<string, number>()
  for (const gram of grams(value)) counts.set(gram, (counts.get(gram) || 0) + 1)
  return counts
}

export function cosineSimilarity(left: string, right: string) {
  const a = vector(left); const b = vector(right)
  if (!a.size || !b.size) return 0
  let dot = 0; let leftNorm = 0; let rightNorm = 0
  for (const value of a.values()) leftNorm += value * value
  for (const value of b.values()) rightNorm += value * value
  for (const [gram, value] of a) dot += value * (b.get(gram) || 0)
  return dot / Math.sqrt(leftNorm * rightNorm)
}

export function rankByCosine<T>(query: string, values: T[], getText: (value: T) => string, minimumScore = 0) {
  return values.map((value) => ({ value, score: cosineSimilarity(query, getText(value)) })).filter((entry) => entry.score >= minimumScore).sort((left, right) => right.score - left.score)
}
