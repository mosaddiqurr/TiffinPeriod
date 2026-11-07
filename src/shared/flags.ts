// Real national flags, drawn accurately: country-flag-icons (MIT, https://gitlab.com/catamphetamine/country-flag-icons),
// 3:2 versions. West Indies is a cricket team of several countries, not one country, so it
// keeps its own drawn emblem in teams.ts.

import F_BD from 'country-flag-icons/string/3x2/BD';
import F_IN from 'country-flag-icons/string/3x2/IN';
import F_PK from 'country-flag-icons/string/3x2/PK';
import F_LK from 'country-flag-icons/string/3x2/LK';
import F_AF from 'country-flag-icons/string/3x2/AF';
import F_AU from 'country-flag-icons/string/3x2/AU';
import F_GB_ENG from 'country-flag-icons/string/3x2/GB-ENG';
import F_NZ from 'country-flag-icons/string/3x2/NZ';
import F_ZA from 'country-flag-icons/string/3x2/ZA';
import F_ZW from 'country-flag-icons/string/3x2/ZW';
import F_IE from 'country-flag-icons/string/3x2/IE';
import F_NL from 'country-flag-icons/string/3x2/NL';
import F_GB_SCT from 'country-flag-icons/string/3x2/GB-SCT';
import F_NP from 'country-flag-icons/string/3x2/NP';
import F_AE from 'country-flag-icons/string/3x2/AE';
import F_US from 'country-flag-icons/string/3x2/US';
import F_AR from 'country-flag-icons/string/3x2/AR';
import F_BR from 'country-flag-icons/string/3x2/BR';
import F_FR from 'country-flag-icons/string/3x2/FR';
import F_DE from 'country-flag-icons/string/3x2/DE';
import F_ES from 'country-flag-icons/string/3x2/ES';
import F_PT from 'country-flag-icons/string/3x2/PT';
import F_IT from 'country-flag-icons/string/3x2/IT';
import F_BE from 'country-flag-icons/string/3x2/BE';
import F_HR from 'country-flag-icons/string/3x2/HR';
import F_UY from 'country-flag-icons/string/3x2/UY';
import F_MA from 'country-flag-icons/string/3x2/MA';
import F_JP from 'country-flag-icons/string/3x2/JP';
import F_KR from 'country-flag-icons/string/3x2/KR';
import F_SN from 'country-flag-icons/string/3x2/SN';
import F_NG from 'country-flag-icons/string/3x2/NG';
import F_CO from 'country-flag-icons/string/3x2/CO';
import F_MX from 'country-flag-icons/string/3x2/MX';
import F_DK from 'country-flag-icons/string/3x2/DK';
import F_SE from 'country-flag-icons/string/3x2/SE';
import F_GH from 'country-flag-icons/string/3x2/GH';

/** Team id → the real flag as an SVG string. */
export const REAL_FLAGS: Record<string, string> = {
  ban: F_BD,
  ind: F_IN,
  pak: F_PK,
  sl: F_LK,
  afg: F_AF,
  aus: F_AU,
  eng: F_GB_ENG,
  nz: F_NZ,
  rsa: F_ZA,
  zim: F_ZW,
  ire: F_IE,
  ned: F_NL,
  sco: F_GB_SCT,
  nep: F_NP,
  uae: F_AE,
  usa: F_US,
  arg: F_AR,
  bra: F_BR,
  fra: F_FR,
  ger: F_DE,
  esp: F_ES,
  por: F_PT,
  ita: F_IT,
  bel: F_BE,
  cro: F_HR,
  uru: F_UY,
  mar: F_MA,
  jpn: F_JP,
  kor: F_KR,
  sen: F_SN,
  nga: F_NG,
  col: F_CO,
  mex: F_MX,
  den: F_DK,
  swe: F_SE,
  gha: F_GH,
};
