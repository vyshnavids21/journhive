// The "was it worth it?" ratings a place can have. `name` is what's stored on the post.
export interface PlaceValue {
  name: string;
  icon: string;
  tone: string;
}

export const PLACE_VALUES: PlaceValue[] = [
  { name: 'Totally Worth It', icon: 'verified', tone: 'tone-great' },
  { name: 'Worth Once', icon: 'star', tone: 'tone-good' },
  { name: 'Missed Out', icon: 'schedule', tone: 'tone-neutral' },
  { name: 'Not Worth It', icon: 'thumb_down', tone: 'tone-bad' },
];

export function placeValueMeta(name: string): PlaceValue {
  return PLACE_VALUES.find(v => v.name === name) || { name, icon: 'label', tone: 'tone-neutral' };
}
