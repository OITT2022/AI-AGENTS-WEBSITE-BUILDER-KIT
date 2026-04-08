import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {PresetConfig} from '../types';

export const TextOverlay: React.FC<{
  title: string;
  subtitle?: string;
  cta?: string;
  info?: string;
  accent: string;
  textColor: string;
  rtl: boolean;
  preset?: PresetConfig;
}> = ({title, subtitle, cta, info, accent, textColor, rtl, preset}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const entrance = spring({frame: frame - 3, fps, durationInFrames: 18});
  const opacity = interpolate(frame, [0, 8, 20], [0, 0.75, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp'
  });

  const t = preset?.text;
  const fontFamily = t?.fontFamily ?? 'Noto Sans Hebrew, Noto Sans, sans-serif';
  const titleSize = t?.headlineFontSize ?? 70;
  const subtitleSize = t?.subheadlineFontSize ?? 34;
  const ctaSize = t?.ctaFontSize ?? 28;
  const fontColor = t?.fontColor ?? textColor;
  const positions = t?.positions;

  const shadow = t?.shadowEnabled !== false
    ? `${t?.shadowX ?? 0}px ${t?.shadowY ?? 10}px 28px ${t?.shadowColor ?? 'rgba(0,0,0,0.35)'}`
    : 'none';
  const strokeShadow = (t?.strokeWidth ?? 0) > 0
    ? `, -${t!.strokeWidth}px 0 ${t?.strokeColor ?? '#000'}, ${t!.strokeWidth}px 0 ${t?.strokeColor ?? '#000'}, 0 -${t!.strokeWidth}px ${t?.strokeColor ?? '#000'}, 0 ${t!.strokeWidth}px ${t?.strokeColor ?? '#000'}`
    : '';

  // Helper to render a positioned text block with full board settings
  const posBlock = (
    text: string | undefined,
    pos: { x: number; y: number; dir?: string; align?: string; w?: number } | undefined,
    style: React.CSSProperties,
  ) => {
    if (!text || !pos) return null;
    return (
      <div style={{
        position: 'absolute',
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, -50%)',
        direction: (pos.dir as any) || 'ltr',
        textAlign: (pos.align as any) || 'center',
        maxWidth: `${pos.w ?? 80}%`,
        ...style,
      }}>{text}</div>
    );
  };

  // If custom positions are set (from Board editor), use absolute positioning
  if (positions && (positions.headline || positions.subtitle || positions.cta || positions.info)) {
    return (
      <AbsoluteFill style={{opacity, fontFamily, transform: `translateY(${(1 - entrance) * 20}px)`}}>
        {posBlock(title, positions.headline, {
          color: fontColor, fontSize: titleSize, fontWeight: 700, lineHeight: 1.04,
          letterSpacing: -1.5, textShadow: shadow + strokeShadow,
        })}
        {posBlock(subtitle, positions.subtitle, {
          color: fontColor, fontSize: subtitleSize, lineHeight: 1.35, opacity: 0.94,
          textShadow: shadow,
        })}
        {posBlock(info, positions.info, {
          color: fontColor, fontSize: Math.round(subtitleSize * 0.75), lineHeight: 1.4,
          opacity: 0.9, textShadow: shadow, whiteSpace: 'pre-line',
        })}
        {cta && positions.cta ? (
          <div style={{
            position: 'absolute',
            left: `${positions.cta.x}%`, top: `${positions.cta.y}%`,
            transform: 'translate(-50%, -50%)',
            direction: (positions.cta.dir as any) || 'ltr',
            color: '#111', backgroundColor: accent, borderRadius: 999,
            padding: `${Math.round(ctaSize * 0.65)}px ${Math.round(ctaSize * 1)}px`,
            fontSize: ctaSize, fontWeight: 700, display: 'inline-flex',
            maxWidth: `${positions.cta.w ?? 80}%`,
          }}>{cta}</div>
        ) : null}
      </AbsoluteFill>
    );
  }

  // Default layout: bottom-aligned with safe margins
  const align = t?.textAlign ?? (rtl ? 'right' : 'left');
  const alignItems = align === 'center' ? 'center' : align === 'right' || rtl ? 'flex-end' : 'flex-start';
  const margins = t?.safeMargins ?? { top: 10, bottom: 10, left: 5, right: 5 };
  const padLeft = Math.round(width * margins.left / 100);
  const padRight = Math.round(width * margins.right / 100);
  const padBottom = Math.round(height * margins.bottom / 100);

  return (
    <AbsoluteFill
      dir={rtl ? 'rtl' : 'ltr'}
      style={{
        justifyContent: 'flex-end',
        padding: `0 ${padRight}px ${padBottom}px ${padLeft}px`,
        opacity, transform: `translateY(${(1 - entrance) * 20}px)`
      }}
    >
      <div style={{
        maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: 18,
        alignItems, textAlign: align, fontFamily
      }}>
        <div style={{width: 110, height: 6, borderRadius: 999, backgroundColor: accent}} />
        <div style={{
          color: fontColor, fontSize: titleSize, fontWeight: 700, lineHeight: 1.04,
          letterSpacing: -1.5, textShadow: shadow + strokeShadow
        }}>{title}</div>
        {subtitle ? (
          <div style={{
            color: fontColor, fontSize: subtitleSize, lineHeight: 1.35, opacity: 0.94,
            maxWidth: '90%', textShadow: shadow
          }}>{subtitle}</div>
        ) : null}
        {info ? (
          <div style={{
            color: fontColor, fontSize: Math.round(subtitleSize * 0.75), lineHeight: 1.4,
            opacity: 0.9, textShadow: shadow, whiteSpace: 'pre-line', maxWidth: '90%',
          }}>{info}</div>
        ) : null}
        {cta ? (
          <div style={{
            marginTop: 10, color: '#111', backgroundColor: accent, borderRadius: 999,
            padding: `${Math.round(ctaSize * 0.65)}px ${Math.round(ctaSize * 1)}px`,
            fontSize: ctaSize, fontWeight: 700, display: 'inline-flex', alignSelf: alignItems
          }}>{cta}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
