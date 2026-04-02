import React from 'react';
import {Composition} from 'remotion';
import {SlideshowAd} from './templates/SlideshowAd';
import type {PlannedVideo} from './types';
import {planVideo} from './engine/planner';

const fallbackVideo = planVideo({
  projectId: 'fallback',
  platform: 'tiktok',
  language: 'en',
  style: 'modern',
  title: 'Sample Slideshow',
  subtitle: 'Replace input props from the render script.',
  cta: 'Learn More',
  images: [{src: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=1200&auto=format&fit=crop'}]
});

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SlideshowAd"
      component={SlideshowAd}
      durationInFrames={fallbackVideo.totalFrames}
      fps={fallbackVideo.fps}
      width={fallbackVideo.width}
      height={fallbackVideo.height}
      defaultProps={{video: fallbackVideo} as {video: PlannedVideo}}
    />
  );
};
