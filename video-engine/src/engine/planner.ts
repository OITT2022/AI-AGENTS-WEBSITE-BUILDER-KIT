import type {JobInput, PlannedScene, PlannedVideo} from '../types';
import {getPlatformDimensions} from '../utils/platform';

const DEFAULT_INTRO_SECONDS = 1.4;
const DEFAULT_OUTRO_SECONDS = 1.8;
const DEFAULT_IMAGE_SECONDS = 2.8;

export const planVideo = (input: JobInput): PlannedVideo => {
  const fps = input.fps ?? 30;
  const {width, height} = getPlatformDimensions(input.platform);

  // Use preset timing if available, otherwise defaults
  const INTRO_SECONDS = input.preset?.introDurationSeconds ?? DEFAULT_INTRO_SECONDS;
  const OUTRO_SECONDS = input.preset?.outroDurationSeconds ?? DEFAULT_OUTRO_SECONDS;
  const IMAGE_SECONDS = input.preset?.imageDurationSeconds ?? DEFAULT_IMAGE_SECONDS;

  const scenes: PlannedScene[] = [];
  let cursor = 0;

  const introFrames = Math.round(INTRO_SECONDS * fps);
  scenes.push({
    id: 'intro',
    type: 'intro',
    from: cursor,
    durationInFrames: introFrames
  });
  cursor += introFrames;

  input.images.forEach((image, index) => {
    const durationInFrames = Math.round((image.holdSeconds ?? IMAGE_SECONDS) * fps);
    scenes.push({
      id: `image-${index + 1}`,
      type: 'image',
      from: cursor,
      durationInFrames,
      image
    });
    cursor += durationInFrames;
  });

  const outroFrames = Math.round(OUTRO_SECONDS * fps);
  scenes.push({
    id: 'outro',
    type: 'outro',
    from: cursor,
    durationInFrames: outroFrames
  });
  cursor += outroFrames;

  return {
    width,
    height,
    fps,
    totalFrames: cursor,
    scenes,
    input
  };
};
