import * as THREE from "three";
import spline from "./spline.js";
import { EffectComposer } from "jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "jsm/postprocessing/UnrealBloomPass.js";
import getStarfield from "./getStarfield.js";

let w = window.innerWidth;
let h = window.innerHeight;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.3);
const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
camera.position.z = 5;
scene.add(camera);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(w, h);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// post-processing
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 1.5, 0.4, 100);
bloomPass.threshold = 0.002;
bloomPass.strength = 3.5;
bloomPass.radius = 0;
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

const stars = getStarfield();
scene.add(stars);

// create a tube geometry from the spline
const tubeGeo = new THREE.TubeGeometry(spline, 222, 0.65, 16, true);

// create edges geometry from the spline
const tubeColor = 0x00ccff;
const edges = new THREE.EdgesGeometry(tubeGeo, 0.2);
const lineMat = new THREE.LineBasicMaterial({ color: tubeColor });
const tubeLines = new THREE.LineSegments(edges, lineMat);
scene.add(tubeLines);

const hitMat = new THREE.MeshBasicMaterial({
  color: tubeColor,
  transparent: true,
  opacity: 0.0,
  side: THREE.BackSide
});
const tubeHitArea = new THREE.Mesh(tubeGeo, hitMat);
scene.add(tubeHitArea);

const boxGroup = new THREE.Group();
scene.add(boxGroup);

const numBoxes = 55;
const size = 0.075;
const boxGeo = new THREE.BoxGeometry(size, size, size);
for (let i = 0; i < numBoxes; i += 1) {
  const p = (i / numBoxes + Math.random() * 0.1) % 1;
  const pos = tubeGeo.parameters.path.getPointAt(p);
  const color = new THREE.Color().setHSL(0.7 + p, 1, 0.5);
  const boxMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.0
  });
  const hitBox = new THREE.Mesh(boxGeo, boxMat);
  hitBox.name = 'box';

  pos.x += Math.random() - 0.4;
  pos.z += Math.random() - 0.4;
  hitBox.position.copy(pos);
  const rote = new THREE.Vector3(
    Math.random() * Math.PI,
    Math.random() * Math.PI,
    Math.random() * Math.PI
  );
  hitBox.rotation.set(rote.x, rote.y, rote.z);
  const edges = new THREE.EdgesGeometry(boxGeo, 0.2);

  const lineMat = new THREE.LineBasicMaterial({ color });
  const boxLines = new THREE.LineSegments(edges, lineMat);
  boxLines.position.copy(pos);
  boxLines.rotation.set(rote.x, rote.y, rote.z);
  hitBox.userData.box = boxLines;
  boxGroup.add(hitBox);
  scene.add(boxLines);
}

// CROSSHAIRS
let mousePos = new THREE.Vector2();
const crosshairs = new THREE.Group();
crosshairs.position.z = -1;
camera.add(crosshairs);
const crossMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
});
const lineGeo = new THREE.BufferGeometry();
const lineVerts = [0, 0.05, 0, 0, 0.02, 0];
lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(lineVerts, 3));

for (let i = 0; i < 4; i += 1) {
  const line = new THREE.Line(lineGeo, crossMat);
  line.rotation.z = i * 0.5 * Math.PI;
  crosshairs.add(line);
}

const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const impactPos = new THREE.Vector3();
const impactColor = new THREE.Color();
let impactBox = null;

let lasers = [];
const laserGeo = new THREE.IcosahedronGeometry(0.05, 2);

function getLaserBolt() {
  const laserMat = new THREE.MeshBasicMaterial({
    color: 0xFFCC00,
    transparent: true,
    fog: false
  });
  var laserBolt = new THREE.Mesh(laserGeo, laserMat);
  laserBolt.position.copy(camera.position);

  let active = true;
  let speed = 0.5;

  let goalPos = camera.position.clone()
    .setFromMatrixPosition(crosshairs.matrixWorld);

  const laserDirection = new THREE.Vector3(0, 0, 0);
  laserDirection.subVectors(laserBolt.position, goalPos)
    .normalize()
    .multiplyScalar(speed);

  direction.subVectors(goalPos, camera.position);
  raycaster.set(camera.position, direction);
  let intersects = raycaster.intersectObjects([...boxGroup.children, tubeHitArea], true);

  if (intersects.length > 0) {
    impactPos.copy(intersects[0].point);
    impactColor.copy(intersects[0].object.material.color);
    if (intersects[0].object.name === 'box') {
      impactBox = intersects[0].object.userData.box;
      boxGroup.remove(intersects[0].object);
    }
  }

  let scale = 1.0;
  let opacity = 1.0;
  let isExploding = false;

  function update() {
    if (active === true) {
    if (isExploding === false) {
      laserBolt.position.sub(laserDirection);

      if (laserBolt.position.distanceTo(impactPos) < 0.5) {
        laserBolt.position.copy(impactPos);
        laserBolt.material.color.set(impactColor);
        isExploding = true;
        impactBox?.scale.setScalar(0.0);
      }
    } else {
      if (opacity > 0.01) {
        scale += 0.2;
        opacity *= 0.85;

      } else {
        opacity = 0.0;
        scale = 0.01;
        active = false;
      }
      laserBolt.scale.setScalar(scale);
      laserBolt.material.opacity = opacity;
      laserBolt.userData.active = active;
    }
  }
  }
  laserBolt.userData = { update, active };
  return laserBolt;
}

function updateCamera(t) {
  const time = t * 0.1;
  const looptime = 10 * 1000;
  const p = (time % looptime) / looptime;
  const pos = tubeGeo.parameters.path.getPointAt(p);
  const lookAt = tubeGeo.parameters.path.getPointAt((p + 0.03) % 1);
  camera.position.copy(pos);
  camera.lookAt(lookAt);
}

function animate(t = 0) {
  requestAnimationFrame(animate);
  updateCamera(t);
  crosshairs.position.set(mousePos.x, mousePos.y, -1);
  lasers.forEach(l => l.userData.update());
  composer.render(scene, camera);
}
animate();

function fireLaser() {
  const laser = getLaserBolt();
  lasers.push(laser);
  scene.add(laser);

  // cleanup
  let inactiveLasers = lasers.filter((l) => l.userData.active === false);
  scene.remove(...inactiveLasers);
  lasers = lasers.filter((l) => l.userData.active === true);
}
window.addEventListener('click', () => fireLaser());

function onMouseMove(evt) {
  w = window.innerWidth;
  h = window.innerHeight;
  let aspect = w / h;
  let fudge = { x: aspect * 0.75, y: 0.75 };
  mousePos.x = ((evt.clientX / w) * 2 - 1) * fudge.x;
  mousePos.y = (-1 * (evt.clientY / h) * 2 + 1) * fudge.y;
}
window.addEventListener('mousemove', onMouseMove, false);

function handleWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', handleWindowResize, false);