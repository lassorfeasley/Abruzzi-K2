// Shared mutable state. Exported as a single object so other modules can both
// read and write its fields (ES module `import * as` bindings are read-only,
// which is why a plain mutable object is used instead).
const state = {
  current: 0,
  playing: false,
  paused: false,
  playTimer: null,
  map: null,
  markers: [],
  fullCoords: [],
  dayIdx: [],
  routeReady: false,
  orbitRAF: null,
  camRAF: null,
  camView: null,
  lastDay: 0,
  cumDist: [],
  elevAt: [],

  userBearingOffset: 0,
  userPitchOffset: 0,
  userPanTime: 0,
  USER_PAN_IDLE: 5000,
  USER_PAN_RATE: 2,

  smoothMph: 30,
  mphIdx: 3,
  isNight: true,
  perfMode: false,

  _dragActive: false,
  _dragX: 0,
  _dragY: 0,
  _decayRAF: null,

  uiHideTimer: null,
};

export default state;
