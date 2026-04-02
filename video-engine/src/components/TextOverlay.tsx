import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

export const TextOverlay: React.FC<{
  title: string;
  subtitle?: string;
  cta?: string;
  accent: string;
  textColor: string;
  rtl: boolean;
}> = ({title, subtitle, cta, accent, textColor, rtl}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entrance = spring({frame: frame - 3, fps, durationInFrames: 18});
  const opacity = interpolate(frame, [0, 8, 20], [0, 0.75, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  return (
    <AbsoluteFill
      dir={rtl ? 'rtl' : 'ltr'}
      style={{
        justifyContent: 'flex-end',
        padding: '0 76px 120px 76px',
        opacity,
        transform: `translateY(${(1 - entrance) * 20}px)`
      }}
    >
      <div
        style={{
          maxWidth: '82%',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          alignItems: rtl ? 'flex-end' : 'flex-start',
          textAlign: rtl ? 'right' : 'left'
        }}
      >
        <div
          style={{
            width: 110,
            height: 6,
            borderRadius: 999,
            backgroundColor: accent
          }}
        />
        <div
          style={{
            color: textColor,
            fontSize: 70,
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: -1.5,
            textShadow: '0 10px 28px rgba(0,0,0,0.35)'
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              color: textColor,
              fontSize: 34,
              lineHeight: 1.35,
              opacity: 0.94,
              maxWidth: '90%'
            }}
          >
            {subtitle}
          </div>
        ) : null}
        {cta ? (
          <div
            style={{
              marginTop: 10,
              color: '#111',
              backgroundColor: accent,
              borderRadius: 999,
              padding: '18px 28px',
              fontSize: 28,
              fontWeight: 700,
              display: 'inline-flex',
              alignSelf: rtl ? 'flex-end' : 'flex-start'
            }}
          >
            {cta}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
