import React from 'react';
import {AbsoluteFill, Img} from 'remotion';

const getPositionStyle = (position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => {
  switch (position) {
    case 'top-left':
      return {top: 54, left: 54};
    case 'top-right':
      return {top: 54, right: 54};
    case 'bottom-left':
      return {bottom: 54, left: 54};
    case 'bottom-right':
    default:
      return {bottom: 54, right: 54};
  }
};

export const LogoOverlay: React.FC<{
  src: string;
  width?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity?: number;
}> = ({src, width = 140, position = 'top-right', opacity = 1}) => {
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          ...getPositionStyle(position),
          opacity,
        }}
      >
        <Img
          src={src}
          style={{
            width,
            height: 'auto',
            objectFit: 'contain',
            filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.35))'
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
