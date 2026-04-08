import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Series,
  interpolate,
  staticFile,
  useCurrentFrame
} from 'remotion';
import type {PlannedVideo} from '../types';
import {ImageSlide} from '../components/ImageSlide';
import {TextOverlay} from '../components/TextOverlay';
import {LogoOverlay} from '../components/LogoOverlay';
import {getThemeByStyle} from '../utils/theme';

/** Resolve asset src: URLs pass through, local filenames use staticFile() */
const resolveSrc = (src: string): string => {
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return src;
  return staticFile(src);
};

export const SlideshowAd: React.FC<{video: PlannedVideo}> = ({video}) => {
  const frame = useCurrentFrame();
  const theme = getThemeByStyle(video.input.style);
  const accent = video.input.themeColor ?? theme.accent;
  const textColor = video.input.textColor ?? theme.text;
  const backgroundColor = video.input.backgroundColor ?? theme.background;
  const overlay = theme.overlay;
  const rtl = video.input.rtl ?? ['he', 'ar'].includes(video.input.language);
  const preset = video.input.preset;

  // Audio: use preset fade settings if available
  const musicVolume = preset?.audio?.musicVolume ?? video.input.music?.volume ?? 0.7;
  const fadeInFrames = preset?.audio?.fadeInFrames ?? 20;
  const fadeOutFrames = preset?.audio?.fadeOutFrames ?? 20;
  const audioFade = interpolate(
    frame,
    [0, fadeInFrames, video.totalFrames - fadeOutFrames, video.totalFrames],
    [0, musicVolume, musicVolume, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Intro text sizes from preset
  const introTitleSize = preset?.text?.headlineFontSize ?? 80;
  const introSubSize = preset?.text?.subheadlineFontSize ?? 34;
  const outroTitleSize = preset?.text?.headlineFontSize ? Math.round(preset.text.headlineFontSize * 0.88) : 70;
  const outroSubSize = preset?.text?.subheadlineFontSize ?? 32;

  // Logo overlay settings
  const logoOpacity = preset?.overlay?.logoOpacity ?? 1;
  const logoWidth = preset?.overlay?.logoWidth ?? video.input.logo?.width;

  return (
    <AbsoluteFill style={{backgroundColor}}>
      {video.input.music ? <Audio src={resolveSrc(video.input.music.src)} volume={audioFade} /> : null}

      <Series>
        {video.scenes.map((scene, index) => {
          if (scene.type === 'intro') {
            return (
              <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
                <AbsoluteFill
                  style={{
                    background: `linear-gradient(135deg, ${backgroundColor} 0%, #1b1b1d 100%)`,
                    justifyContent: 'center',
                    alignItems: rtl ? 'flex-end' : 'flex-start',
                    padding: '0 72px'
                  }}
                  dir={rtl ? 'rtl' : 'ltr'}
                >
                  <div style={{maxWidth: '82%', textAlign: rtl ? 'right' : 'left'}}>
                    <div style={{fontSize: introTitleSize, color: textColor, fontWeight: 800, lineHeight: 1.02, textShadow: '0 4px 20px rgba(0,0,0,0.5)'}}>{video.input.title}</div>
                    {video.input.subtitle ? (
                      <div style={{marginTop: 22, fontSize: introSubSize, lineHeight: 1.35, color: textColor, opacity: 0.9, textShadow: '0 2px 12px rgba(0,0,0,0.4)'}}>
                        {video.input.subtitle}
                      </div>
                    ) : null}
                  </div>
                </AbsoluteFill>
              </Series.Sequence>
            );
          }

          if (scene.type === 'outro') {
            return (
              <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
                <AbsoluteFill
                  style={{
                    background: `linear-gradient(180deg, ${backgroundColor} 0%, #000 100%)`,
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '0 72px'
                  }}
                  dir={rtl ? 'rtl' : 'ltr'}
                >
                  <div style={{textAlign: 'center', maxWidth: '86%'}}>
                    <div style={{fontSize: outroTitleSize, lineHeight: 1.06, color: textColor, fontWeight: 800, textShadow: '0 4px 20px rgba(0,0,0,0.5)'}}>
                      {video.input.outroTitle ?? video.input.cta ?? ''}
                    </div>
                    {video.input.outroSubtitle ? (
                      <div style={{marginTop: 20, fontSize: outroSubSize, color: textColor, opacity: 0.9, lineHeight: 1.35}}>
                        {video.input.outroSubtitle}
                      </div>
                    ) : null}
                  </div>
                </AbsoluteFill>
              </Series.Sequence>
            );
          }

          return (
            <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
              <AbsoluteFill>
                <ImageSlide src={resolveSrc(scene.image!.src)} fitMode={video.input.fitMode ?? 'cover'} overlay={overlay} />
                <TextOverlay
                  title={index === 1 ? video.input.title : scene.image?.caption ?? video.input.title}
                  subtitle={index === 1 ? video.input.subtitle : undefined}
                  cta={index === video.scenes.length - 2 ? video.input.cta : undefined}
                  accent={accent}
                  textColor={textColor}
                  rtl={rtl}
                  preset={preset}
                />
                {video.input.logo ? (
                  <LogoOverlay
                    src={resolveSrc(video.input.logo.src)}
                    width={logoWidth}
                    position={video.input.logo.position}
                    opacity={logoOpacity}
                  />
                ) : null}
              </AbsoluteFill>
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
