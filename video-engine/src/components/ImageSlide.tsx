import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {FitMode} from '../types';

export const ImageSlide: React.FC<{
  src: string;
  fitMode: FitMode;
  overlay: string;
}> = ({src, fitMode, overlay}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const entrance = spring({frame, fps, durationInFrames: Math.min(durationInFrames, fps)});
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  const translateX = interpolate(frame, [0, durationInFrames], [0, -18], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <AbsoluteFill
        style={{
          opacity: entrance,
          transform: `scale(${scale}) translateX(${translateX}px)`
        }}
      >
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: fitMode
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{backgroundColor: overlay}} />
    </AbsoluteFill>
  );
};
