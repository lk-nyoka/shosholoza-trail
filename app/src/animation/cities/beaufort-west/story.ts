// What the Beaufort West chapter says, kept apart from how it is drawn.
//
// Every card carries its source and a confidence, following the plan in
// "Beaufort West/Developer-Ready Plan...": documentary milestones are stated
// as documented; anything drawn from them (herds, the town's growth) is
// labelled illustrative rather than implying precision it does not have.

export type Confidence = 'Documented' | 'OSM-mapped' | 'Verified SANParks waypoint' | 'Illustrative';

export type TimelineEvent = {
  year: number;
  title: string;
  body: string;
  source: string;
  confidence: Confidence;
};

/** Documentary milestones, oldest first. */
export const TIMELINE: TimelineEvent[] = [
  { year: 1818, title: 'Beaufort district', body: 'The district is proclaimed on the Gamka River, at the foot of the Nuweveld mountains.', source: 'Beaufort West Municipality', confidence: 'Documented' },
  { year: 1837, title: 'Oldest municipality', body: 'Beaufort West is proclaimed a municipality - the oldest in South Africa.', source: 'Beaufort West Municipality', confidence: 'Documented' },
  { year: 1880, title: 'The railway arrives', body: 'The Cape Government Railways line north from Cape Town reaches Beaufort West on its way to the diamond fields at Kimberley.', source: 'Cape Government Railways history', confidence: 'Documented' },
  { year: 1901, title: 'Blockhouse line', body: 'During the Anglo-Boer War, blockhouses guard the railway through the Karoo. One still stands north of the station.', source: 'OSM way 1436600947 (historic=fort)', confidence: 'OSM-mapped' },
  { year: 1922, title: 'Chris Barnard is born', body: 'Christiaan Barnard is born in Beaufort West, son of the local Dutch Reformed mission minister.', source: 'Beaufort West Museum', confidence: 'Documented' },
  { year: 1967, title: 'First heart transplant', body: 'In Cape Town, Barnard leads the world\'s first human-to-human heart transplant. The town museum keeps his story.', source: 'Beaufort West Museum', confidence: 'Documented' },
  { year: 1979, title: 'Karoo National Park', body: 'The park is proclaimed on the plains and Nuweveld slopes just west of town.', source: 'SANParks', confidence: 'Documented' },
  { year: 1993, title: 'Black rhino return', body: 'Black rhino are reintroduced to the park.', source: 'SANParks', confidence: 'Documented' },
  { year: 2010, title: 'Lions return', body: 'Lions are reintroduced to the Karoo National Park.', source: 'SANParks', confidence: 'Documented' },
  { year: 2012, title: 'Brown hyena return', body: 'Brown hyena are reintroduced, restoring another Karoo predator.', source: 'SANParks', confidence: 'Documented' },
];

export type BeatId = 'approach' | 'blockhouse' | 'arrival' | 'church' | 'museum' | 'karoo' | 'wildlife' | 'night' | 'departure';

export type Beat = {
  id: BeatId;
  phase: string;
  title: string;
  body: string;
  /** Timeline years this beat lights up. */
  years: number[];
  /** Minimum time on screen, ms, before the next beat. */
  holdMs: number;
};

/** The guided story, in order. */
export const BEATS: Beat[] = [
  { id: 'approach', phase: 'Approach', title: 'Into the Great Karoo', body: 'South of De Aar the line crosses the open Karoo. Ahead, under the Nuweveld escarpment, is Beaufort West.', years: [], holdMs: 7000 },
  { id: 'blockhouse', phase: 'Blockhouse', title: 'Beaufort West Blockhouse', body: 'An Anglo-Boer War blockhouse still stands beside the line it was built to guard.', years: [1901], holdMs: 5000 },
  { id: 'arrival', phase: 'Arrival', title: 'Beaufort West station', body: 'The main stop in the Great Karoo since the railway came through in 1880.', years: [1880], holdMs: 4500 },
  { id: 'church', phase: 'Town', title: 'NG Kerk Beaufort West', body: 'The Dutch Reformed mother church and its spire stand at the centre of the oldest municipality in the country.', years: [1818, 1837], holdMs: 6000 },
  { id: 'museum', phase: 'Town', title: 'Beaufort West Museum', body: 'Next to the church, the museum complex tells the town\'s story - including that of Chris Barnard, born here in 1922.', years: [1922, 1967], holdMs: 6500 },
  { id: 'karoo', phase: 'Karoo', title: 'Karoo National Park', body: 'West of town the plains rise to the Nuweveld peaks. The park protects Nama-Karoo shrubland, riparian thicket and the mountain grasslands above.', years: [1979], holdMs: 6500 },
  { id: 'wildlife', phase: 'Karoo', title: 'Back on the plains', body: 'Springbok, Cape mountain zebra and ostrich belong here. Rhino, lion and brown hyena have all been brought back to the park.', years: [1993, 2010, 2012], holdMs: 6500 },
  { id: 'night', phase: 'Karoo night', title: 'Karoo skies', body: 'Far from city light, the Karoo has some of the darkest skies in the country.', years: [], holdMs: 6000 },
  { id: 'departure', phase: 'Departure', title: 'Onward to Cape Town', body: 'The train leaves for the Hex River mountains and the Cape. Beaufort West stamp collected.', years: [], holdMs: 5000 },
];

export const WILDLIFE_NOTICE = 'Illustrative wildlife - not live animal locations.';

export function eventsFor(beat: Beat) {
  return TIMELINE.filter(event => beat.years.includes(event.year));
}
