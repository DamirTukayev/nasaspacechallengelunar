import { describe, expect, it } from 'vitest'
import type { LandingSearch } from './landing'
import { scoreGridCells } from './scoreLayer'

function search(total: number[], eligible = total.map(() => true)): LandingSearch {
  return {
    spacing_km: 5,
    points: { x_km: [-5, 0, 5, 10, 15], y_km: [10, 0, -10, 0, 0], total, eligible },
  } as unknown as LandingSearch
}

describe('overall score grid', () => {
  it('centers each footprint on the actual grid sample with +y pointing north', () => {
    const cells = scoreGridCells(search([0.2, 0.6, 0.8]))
    expect(cells[0]).toMatchObject({ index: 0, leftKm: -7.5, topKm: 12.5, sizeKm: 5 })
    expect(cells[1]).toMatchObject({ leftKm: -2.5, topKm: 2.5 })
    expect(cells[2]).toMatchObject({ leftKm: 2.5, topKm: -7.5 })
  })
  it('keeps absolute 0-1 scores, including zero, without promoting the best value to one', () => {
    expect(scoreGridCells(search([0, 0.4, 0.684])).map((cell) => cell.score)).toEqual([
      0, 0.4, 0.684,
    ])
    expect(scoreGridCells(search([1]))[0].score).toBe(1)
  })
  it('keeps eligibility separate from the numeric score', () => {
    const cells = scoreGridCells(search([0.9, 0.4], [false, true]))
    expect(cells.map((cell) => [cell.score, cell.eligible])).toEqual([
      [0.9, false],
      [0.4, true],
    ])
  })
  it('leaves invalid or missing scores unpainted instead of inventing zero values', () => {
    expect(
      scoreGridCells(search([NaN, Infinity, -0.1, 1.1, 0.3])).map((cell) => cell.index),
    ).toEqual([4])
    const data = search([0.5])
    data.points.x_km[0] = NaN
    expect(scoreGridCells(data)).toEqual([])
    data.spacing_km = 0
    expect(scoreGridCells(data)).toEqual([])
  })
})
