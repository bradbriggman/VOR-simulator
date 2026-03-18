const canvas = document.getElementById('vorCanvas');
const ctx = canvas.getContext('2d');

const modeSelect = document.getElementById('modeSelect');
const quizToggle = document.getElementById('quizToggle');
const newQuizBtn = document.getElementById('newQuizBtn');
const quizStatus = document.getElementById('quizStatus');

const vorSelect = document.getElementById('vorSelect');

const obsSlider = document.getElementById('obs');
const obsValue = document.getElementById('obsValue');

const hdgSlider = document.getElementById('hdg');
const hdgValue = document.getElementById('hdgValue');

const acXSlider = document.getElementById('acX');
const acYSlider = document.getElementById('acY');
const acXValue = document.getElementById('acXValue');
const acYValue = document.getElementById('acYValue');

const radialReadout = document.getElementById('radialReadout');
const cdiReadout = document.getElementById('cdiReadout');
const toFromReadout = document.getElementById('toFromReadout');
const distanceReadout = document.getElementById('distanceReadout');
const vorPosReadout = document.getElementById('vorPosReadout');

const guessRadialInput = document.getElementById('guessRadial');
const guessToFromSelect = document.getElementById('guessToFrom');
const checkQuizBtn = document.getElementById('checkQuizBtn');

// Canvas geometry
const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const instrumentRadius = 200;

// State
let mode = 'vor'; // 'vor' or 'hsi'
let obs = 0;
let hdg = 0;
let acX = 10;
let acY = 10;

// Define up to 3 VORs in NM coordinates (relative to some arbitrary origin)
const vors = [
  { name: 'VOR 1', x: 0,  y: 0 },
  { name: 'VOR 2', x: -20, y: 15 },
  { name: 'VOR 3', x: 25, y: -10 }
];
let activeVorIndex = 0;

// Quiz state
let quizActive = false;
let quizSolution = null;

// Utility: normalize angle to 0–359
function norm360(angle) {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
}

// Utility: normalize to -180–+180
function norm180(angle) {
  let a = ((angle + 180) % 360) - 180;
  if (a < -180) a += 360;
  return a;
}

// Compute bearing from VOR to aircraft (radial)
function computeRadial(vor, acX, acY) {
  const dx = acX - vor.x;
  const dy = acY - vor.y;
  const angleRad = Math.atan2(dx, dy); // 0° = north, clockwise
  let bearingDeg = angleRad * 180 / Math.PI;
  bearingDeg = norm360(bearingDeg);
  return bearingDeg; // radial FROM the station
}

// Distance in NM
function computeDistance(vor, acX, acY) {
  const dx = acX - vor.x;
  const dy = acY - vor.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// CDI deflection: difference between selected course and radial
// Limit to ±10° for full-scale deflection
function computeCdiDeflection(radial, obs) {
  const diff = norm180(obs - radial);
  const fullScale = 10; // degrees
  let deflection = Math.max(-fullScale, Math.min(fullScale, diff));
  return deflection;
}

// TO/FROM logic
function computeToFrom(radial, obs) {
  const reciprocalRadial = norm360(radial + 180);
  const diff = Math.abs(norm180(obs - reciprocalRadial));
  if (diff < 90) return "TO";
  if (diff > 90) return "FROM";
  return "OFF";
}

// Convert NM position to canvas coordinates
function nmToCanvas(xNm, yNm) {
  const scale = instrumentRadius / 40; // 40 NM to edge
  const x = centerX + xNm * scale;
  const y = centerY - yNm * scale;
  return { x, y };
}

function drawInstrumentFace() {
  ctx.save();
  ctx.translate(centerX, centerY);

  // Outer circle
  ctx.beginPath();
  ctx.arc(0, 0, instrumentRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#fdfdfd";
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Tick marks every 30°
  ctx.save();
  for (let deg = 0; deg < 360; deg += 30) {
    const rad = deg * Math.PI / 180;
    const r1 = instrumentRadius - 10;
    const r2 = instrumentRadius;
    const x1 = r1 * Math.sin(rad);
    const y1 = -r1 * Math.cos(rad);
    const x2 = r2 * Math.sin(rad);
    const y2 = -r2 * Math.cos(rad);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label cardinal directions
    if (deg % 90 === 0) {
      const label = deg === 0 ? "N" : deg === 90 ? "E" : deg === 180 ? "S" : "W";
      const lr = instrumentRadius - 25;
      const lx = lr * Math.sin(rad);
      const ly = -lr * Math.cos(rad);
      ctx.font = "16px system-ui";
      ctx.fillStyle = "#000";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lx, ly);
    }
  }
  ctx.restore();

  ctx.restore();
}

function drawObsCard() {
  ctx.save();
  ctx.translate(centerX, centerY);

  // Rotate card opposite to selected course
  ctx.rotate(-obs * Math.PI / 180);

  // Course arrow at top
  ctx.beginPath();
  ctx.moveTo(0, -instrumentRadius + 20);
  ctx.lineTo(-8, -instrumentRadius + 35);
  ctx.lineTo(8, -instrumentRadius + 35);
  ctx.closePath();
  ctx.fillStyle = "#0077cc";
  ctx.fill();

  ctx.restore();
}

function drawHeadingBug() {
  if (mode !== 'hsi') return;

  ctx.save();
  ctx.translate(centerX, centerY);

  // Rotate entire compass card by heading
  ctx.rotate(-hdg * Math.PI / 180);

  // Heading index at top
  ctx.beginPath();
  ctx.moveTo(0, -instrumentRadius);
  ctx.lineTo(-6, -instrumentRadius + 12);
  ctx.lineTo(6, -instrumentRadius + 12);
  ctx.closePath();
  ctx.fillStyle = "#ff8800";
  ctx.fill();

  ctx.restore();
}

function drawCdi(deflection) {
  ctx.save();
  ctx.translate(centerX, centerY);

  // CDI scale
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-60, 0);
  ctx.lineTo(60, 0);
  ctx.stroke();

  // CDI dots
  for (let i = -2; i <= 2; i++) {
    const x = i * 20;
    ctx.beginPath();
    ctx.arc(x, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#555";
    ctx.fill();
  }

  // Needle
  const maxPixels = 40; // full-scale deflection
  const fullScale = 10; // degrees
  const offset = (deflection / fullScale) * maxPixels;

  ctx.beginPath();
  ctx.moveTo(offset, -60);
  ctx.lineTo(offset, 60);
  ctx.strokeStyle = "#00aa00";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.restore();
}

function drawToFromFlag(toFrom) {
  ctx.save();
  ctx.translate(centerX, centerY);

  ctx.font = "18px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (toFrom === "TO") {
    ctx.fillStyle = "#007700";
    ctx.fillText("TO", 0, -90);
  } else if (toFrom === "FROM") {
    ctx.fillStyle = "#770000";
    ctx.fillText("FROM", 0, -90);
  } else {
    ctx.fillStyle = "#555555";
    ctx.fillText("OFF", 0, -90);
  }

  ctx.restore();
}

function drawMapOverview() {
  // Simple mini-map: VORs + aircraft
  ctx.save();

  // Draw VORs
  vors.forEach((vor, index) => {
    const pos = nmToCanvas(vor.x, vor.y);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = index === activeVorIndex ? "#cc0000" : "#5555aa";
    ctx.fill();

    ctx.font = "10px system-ui";
    ctx.fillStyle = "#000";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(vor.name, pos.x + 6, pos.y - 2);
  });

  // Draw aircraft
  const acPos = nmToCanvas(acX, acY);
  ctx.save();
  ctx.translate(acPos.x, acPos.y);
  ctx.rotate(-hdg * Math.PI / 180);

  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(6, 8);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fillStyle = "#000";
  ctx.fill();

  ctx.restore();
  ctx.restore();
}

function update() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const vor = vors[activeVorIndex];
  const radial = computeRadial(vor, acX, acY);
  const distance = computeDistance(vor, acX, acY);
  const cdiDeflection = computeCdiDeflection(radial, obs);
  const toFrom = computeToFrom(radial, obs);

  // Instrument
  drawInstrumentFace();
  drawObsCard();
  drawHeadingBug();
  drawCdi(cdiDeflection);
  drawToFromFlag(toFrom);

  // Map overlay
  drawMapOverview();

  // Readouts
  radialReadout.textContent = `${radial.toFixed(0)}°`;
  cdiReadout.textContent = `${cdiDeflection.toFixed(1)}°`;
  toFromReadout.textContent = toFrom;
  distanceReadout.textContent = distance.toFixed(1);
  vorPosReadout.textContent = `(${vor.x.toFixed(1)} , ${vor.y.toFixed(1)}) NM`;
}

// Quiz logic
function newQuizPosition() {
  quizActive = quizToggle.checked;
  quizStatus.textContent = "";
  guessRadialInput.value = "";
  guessToFromSelect.value = "";

  if (!quizActive) {
    quizSolution = null;
    update();
    return;
  }

  // Random aircraft position within 30 NM of active VOR
  const vor = vors[activeVorIndex];
  const r = 5 + Math.random() * 25;
  const theta = Math.random() * 2 * Math.PI;
  acX = vor.x + r * Math.sin(theta);
  acY = vor.y + r * Math.cos(theta);

  acXSlider.value = Math.round(acX);
  acYSlider.value = Math.round(acY);
  acXValue.textContent = Math.round(acX);
  acYValue.textContent = Math.round(acY);

  // Random OBS
  obs = Math.floor(Math.random() * 360);
  obsSlider.value = obs;
  obsValue.textContent = `${obs}°`;

  // Compute solution
  const radial = computeRadial(vor, acX, acY);
  const toFrom = computeToFrom(radial, obs);
  quizSolution = { radial, toFrom };

  quizStatus.textContent = "Quiz active: move nothing, just identify radial and TO/FROM.";
  update();
}

function checkQuiz() {
  if (!quizActive || !quizSolution) {
    quizStatus.textContent = "No active quiz. Enable Quiz Mode and click New Quiz Position.";
    return;
  }

  const guessRadial = parseFloat(guessRadialInput.value);
  const guessToFrom = guessToFromSelect.value;

  if (isNaN(guessRadial) || guessToFrom === "") {
    quizStatus.textContent = "Enter both a radial and TO/FROM guess.";
    return;
  }

  const trueRadial = quizSolution.radial;
  const trueToFrom = quizSolution.toFrom;

  const radialError = Math.abs(norm180(guessRadial - trueRadial));
  const radialOk = radialError <= 5; // within 5°
  const toFromOk = guessToFrom === trueToFrom;

  if (radialOk && toFromOk) {
    quizStatus.textContent = `Correct! True radial ${trueRadial.toFixed(0)}°, ${trueToFrom}.`;
  } else {
    quizStatus.textContent =
      `Not quite. True radial ${trueRadial.toFixed(0)}°, ${trueToFrom}. ` +
      `Your error: ${radialError.toFixed(1)}°.`;
  }
}

// Event listeners
modeSelect.addEventListener('change', () => {
  mode = modeSelect.value;
  update();
});

quizToggle.addEventListener('change', () => {
  newQuizPosition();
});

newQuizBtn.addEventListener('click', () => {
  newQuizPosition();
});

vorSelect.addEventListener('change', () => {
  activeVorIndex = parseInt(vorSelect.value, 10);
  newQuizPosition();
});

obsSlider.addEventListener('input', () => {
  obs = parseInt(obsSlider.value, 10);
  obsValue.textContent = `${obs}°`;
  update();
});

hdgSlider.addEventListener('input', () => {
  hdg = parseInt(hdgSlider.value, 10);
  hdgValue.textContent = `${hdg}°`;
  update();
});

acXSlider.addEventListener('input', () => {
  acX = parseInt(acXSlider.value, 10);
  acXValue.textContent = acX;
  update();
});

acYSlider.addEventListener('input', () => {
  acY = parseInt(acYSlider.value, 10);
  acYValue.textContent = acY;
  update();
});

checkQuizBtn.addEventListener('click', () => {
  checkQuiz();
});

// Initial draw
update();
