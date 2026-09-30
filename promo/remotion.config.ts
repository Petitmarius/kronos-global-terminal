import { Config } from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');
Config.setVideoImageFormat('png');
Config.setCodec('h264');
Config.setCrf(15);
Config.setX264Preset('slow');
Config.setPixelFormat('yuv420p');
Config.setColorSpace('bt709');
Config.setAudioCodec('aac');
Config.setAudioBitrate('320k');
Config.setConcurrency(4);
Config.setOverwriteOutput(true);

// Use a locally installed Chromium when one is provided, e.g.
// REMOTION_BROWSER=/path/to/headless_shell npm run render
if (process.env.REMOTION_BROWSER) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
}
