import { describe, expect, it } from 'vitest';
import { ParserService } from '../parserService';

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1);

/** Timestamps for `count` messages spaced `intervalDays` apart. */
function cadence(count: number, intervalDays: number): number[] {
  return Array.from({ length: count }, (_, i) => START + i * intervalDays * DAY);
}

describe('ParserService.estimateFrequencyFromRange', () => {
  it('reports occasional when there is no interval to measure', () => {
    expect(ParserService.estimateFrequencyFromRange(START, START, 1)).toBe('occasional');
    expect(ParserService.estimateFrequencyFromRange(START, START, 0)).toBe('occasional');
  });

  it('classifies a daily newsletter as daily', () => {
    // 30 messages, one per day: 29 days of span for 29 gaps.
    expect(ParserService.estimateFrequencyFromRange(START, START + 29 * DAY, 30)).toBe('daily');
  });

  it('classifies a weekly newsletter as weekly', () => {
    expect(ParserService.estimateFrequencyFromRange(START, START + 70 * DAY, 11)).toBe('weekly');
  });

  it('classifies a monthly newsletter as monthly', () => {
    expect(ParserService.estimateFrequencyFromRange(START, START + 330 * DAY, 12)).toBe('monthly');
  });

  it('classifies a rare sender as occasional', () => {
    expect(ParserService.estimateFrequencyFromRange(START, START + 365 * DAY, 3)).toBe('occasional');
  });

  it('applies the documented thresholds inclusively', () => {
    // Two messages: the span is the single interval, so the boundary is exact.
    expect(ParserService.estimateFrequencyFromRange(START, START + 2 * DAY, 2)).toBe('daily');
    expect(ParserService.estimateFrequencyFromRange(START, START + 2 * DAY + 1, 2)).toBe('weekly');
    expect(ParserService.estimateFrequencyFromRange(START, START + 10 * DAY, 2)).toBe('weekly');
    expect(ParserService.estimateFrequencyFromRange(START, START + 10 * DAY + 1, 2)).toBe('monthly');
    expect(ParserService.estimateFrequencyFromRange(START, START + 45 * DAY, 2)).toBe('monthly');
    expect(ParserService.estimateFrequencyFromRange(START, START + 45 * DAY + 1, 2)).toBe('occasional');
  });

  it('claims nothing on inconsistent or non-numeric windows', () => {
    expect(ParserService.estimateFrequencyFromRange(START + 10 * DAY, START, 5)).toBe('occasional');
    expect(ParserService.estimateFrequencyFromRange(Number.NaN, START, 5)).toBe('occasional');
    expect(ParserService.estimateFrequencyFromRange(START, Number.NaN, 5)).toBe('occasional');
    expect(ParserService.estimateFrequencyFromRange(START, Number.POSITIVE_INFINITY, 5)).toBe('occasional');
  });
});

describe('ParserService.estimateFrequency', () => {
  it('matches the range-based estimate for the same messages', () => {
    for (const [count, interval] of [[30, 1], [11, 7], [12, 30], [3, 180]] as const) {
      const timestamps = cadence(count, interval);
      expect(ParserService.estimateFrequency(timestamps)).toBe(
        ParserService.estimateFrequencyFromRange(
          timestamps[0],
          timestamps[timestamps.length - 1],
          timestamps.length
        )
      );
    }
  });

  it('does not depend on the order of the timestamps', () => {
    const timestamps = cadence(30, 1);
    const shuffled = [...timestamps].reverse();
    expect(ParserService.estimateFrequency(shuffled)).toBe('daily');
    expect(ParserService.estimateFrequency(timestamps)).toBe('daily');
  });

  it('reports occasional for zero or one timestamp', () => {
    expect(ParserService.estimateFrequency([])).toBe('occasional');
    expect(ParserService.estimateFrequency([START])).toBe('occasional');
  });
});
