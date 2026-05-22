import { LitElement, css, html } from 'lit';
import { Analyser } from './analyser.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { backdropFS, backdropVS, sphereVS } from './shaders.js';

export class GdmLiveAudioVisuals3D extends LitElement {
  static get properties() {
    return {
      outputNode: { type: Object },
      inputNode: { type: Object }
    };
  }

  constructor() {
    super();
    this.prevTime = 0;
    this.rotationVec = new THREE.Vector3(0, 0, 0);
  }

  set outputNode(node) {
    this._outputNode = node;
    if (node) this.outputAnalyser = new Analyser(this._outputNode);
  }

  get outputNode() {
    return this._outputNode;
  }

  set inputNode(node) {
    this._inputNode = node;
    if (node) this.inputAnalyser = new Analyser(this._inputNode);
  }

  get inputNode() {
    return this._inputNode;
  }

  static get styles() {
    return css`
      canvas {
        width: 100% !important;
        height: 100% !important;
        position: absolute;
        inset: 0;
        image-rendering: pixelated;
        z-index: -1;
      }
    `;
  }

  init() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100c14);

    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(10, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: { value: new THREE.Vector2(1, 1) },
          rand: { value: 0 },
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
      })
    );
    backdrop.material.side = THREE.BackSide;
    scene.add(backdrop);
    this.backdrop = backdrop;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(2, -2, 5);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio / 1);

    const geometry = new THREE.IcosahedronGeometry(1, 10);

    // Substituindo o EXRLoader por luzes do Three.js para não depender do arquivo piz_compressed.exr
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x000010,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x00aaff,
      emissiveIntensity: 0.2,
    });

    sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = { value: 0 };
      shader.uniforms.inputData = { value: new THREE.Vector4() };
      shader.uniforms.outputData = { value: new THREE.Vector4() };

      sphereMaterial.userData.shader = shader;
      shader.vertexShader = sphereVS;
    };

    const sphere = new THREE.Mesh(geometry, sphereMaterial);
    scene.add(sphere);
    this.sphere = sphere;

    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      2.5, // Bloom strength
      0.5, // Bloom radius
      0    // Bloom threshold
    );

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    this.composer = composer;

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const dPR = renderer.getPixelRatio();
      const w = window.innerWidth;
      const h = window.innerHeight;
      backdrop.material.uniforms.resolution.value.set(w * dPR, h * dPR);
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };

    window.addEventListener('resize', onWindowResize);
    onWindowResize();

    this.animation();
  }

  animation() {
    requestAnimationFrame(() => this.animation());

    if (this.inputAnalyser) this.inputAnalyser.update();
    if (this.outputAnalyser) this.outputAnalyser.update();

    const t = performance.now();
    const dt = (t - this.prevTime) / (1000 / 60);
    this.prevTime = t;

    const backdropMaterial = this.backdrop.material;
    const sphereMaterial = this.sphere.material;

    backdropMaterial.uniforms.rand.value = Math.random() * 10000;

    if (sphereMaterial.userData.shader) {
      // Pega os dados do input ou do output se existirem. 
      // Se não, usa array zerado.
      const outData = this.outputAnalyser ? this.outputAnalyser.data : new Uint8Array(32);
      const inData = this.inputAnalyser ? this.inputAnalyser.data : new Uint8Array(32);

      this.sphere.scale.setScalar(
        1 + (0.2 * outData[1]) / 255 + (0.2 * inData[1]) / 255
      );

      const f = 0.001;
      this.rotationVec.x += (dt * f * 0.5 * outData[1]) / 255 + (dt * f * 0.5 * inData[1]) / 255;
      this.rotationVec.z += (dt * f * 0.5 * inData[1]) / 255;
      this.rotationVec.y += (dt * f * 0.25 * inData[2]) / 255;
      this.rotationVec.y += (dt * f * 0.25 * outData[2]) / 255;

      const euler = new THREE.Euler(
        this.rotationVec.x,
        this.rotationVec.y,
        this.rotationVec.z
      );
      const quaternion = new THREE.Quaternion().setFromEuler(euler);
      const vector = new THREE.Vector3(0, 0, 5);
      vector.applyQuaternion(quaternion);
      this.camera.position.copy(vector);
      this.camera.lookAt(this.sphere.position);

      sphereMaterial.userData.shader.uniforms.time.value +=
        (dt * 0.1 * outData[0]) / 255 + (dt * 0.1 * inData[0]) / 255;

      sphereMaterial.userData.shader.uniforms.inputData.value.set(
        (1 * inData[0]) / 255,
        (0.1 * inData[1]) / 255,
        (10 * inData[2]) / 255,
        0
      );
      sphereMaterial.userData.shader.uniforms.outputData.value.set(
        (2 * outData[0]) / 255,
        (0.1 * outData[1]) / 255,
        (10 * outData[2]) / 255,
        0
      );
    }

    this.composer.render();
  }

  firstUpdated() {
    this.canvas = this.shadowRoot.querySelector('canvas');
    this.init();
  }

  render() {
    return html`<canvas></canvas>`;
  }
}

customElements.define('gdm-live-audio-visuals-3d', GdmLiveAudioVisuals3D);
