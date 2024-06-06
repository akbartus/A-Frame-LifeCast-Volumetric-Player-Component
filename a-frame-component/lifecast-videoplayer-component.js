//////////////////////////////////////
// 1. Lifecast Video Player Shaders //
//////////////////////////////////////
const VR180_VertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const VR180_FragmentShader = `
precision highp float;

#include <common>
uniform sampler2D uTexture;
varying vec2 vUv;

void main() {
  vec2 texture_uv = vec2(vUv.s, vUv.t);
  gl_FragColor = texture2D(uTexture, texture_uv);
}
`;

const decode12bit = `
float decodeInverseDepth(vec2 depth_uv_unscaled, vec2 cell_offset) {
#if defined(DECODE_12BIT)

  vec2 depth_uv_lo = cell_offset + (depth_uv_unscaled + vec2(0.0, 1.0)) * 0.33333333 * 0.5;
  vec2 depth_uv_hi = cell_offset + (depth_uv_unscaled + vec2(1.0, 1.0)) * 0.33333333 * 0.5;

  // Sampling the texture with interpolation causes errors when reconstructing bits,
  // so we'll use texelFetch instead
  //float ds_lo = texture2D(uTexture, depth_uv_lo).r;
  //float ds_hi = texture2D(uTexture, depth_uv_hi).r;

  ivec2 texture_size = textureSize(uTexture, 0);
  ivec2 texel_coord_lo = ivec2(vec2(texture_size) * depth_uv_lo);
  ivec2 texel_coord_hi = ivec2(vec2(texture_size) * depth_uv_hi);
  float ds_lo = texelFetch(uTexture, texel_coord_lo, 0).r;
  float ds_hi = texelFetch(uTexture, texel_coord_hi, 0).r;

  int lo = int(ds_lo * 255.0) & 255;
  int hi = int(ds_hi * 255.0) & 255;
  hi = hi / 16; // decode error correcting code
  lo = (hi & 1) == 0 ? lo : 255 - lo; // unfold

  int i12 = (lo & 255) | ((hi & 15) << 8);
  float f12 = float(i12) / float((1 << 12) - 1);

  return clamp(f12, 0.0001, 1.0);

#else

  // Classic: interpolated texture2D
  //vec2 depth_uv_8bit = cell_offset + depth_uv_unscaled * 0.33333;
  //float depth_sample_8bit = clamp(texture2D(uTexture, depth_uv_8bit).r, 0.0001, 1.0);
  //return depth_sample_8bit;

  // New (maybe faster): texelFetch
  vec2 depth_uv_8bit = cell_offset + depth_uv_unscaled * 0.33333;
  ivec2 texture_size = textureSize(uTexture, 0);
  ivec2 texel_coord = ivec2(vec2(texture_size) * depth_uv_8bit);
  float v = texelFetch(uTexture, texel_coord, 0).r;
  return clamp(v, 0.0001, 1.0);

#endif
}
`;

//////////////////////////// LDI3 shaders ////////////////////////////////////////////////

const LDI3_fthetaFgVertexShader = `
precision highp float;

uniform sampler2D uTexture;
varying vec2 vUv;
varying float vS;
`
+ decode12bit +
`
void main() {
  vUv = uv;
#if defined(LAYER2)
  float depth_sample = decodeInverseDepth(vUv, vec2(0.33333333, 0.66666666));
#else
  float depth_sample = decodeInverseDepth(vUv, vec2(0.33333333, 0.33333333));
#endif

  float s = clamp(0.3 / depth_sample, 0.01, 50.0);
  vS = s;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xyz * s, 1.0);
}
`;

const LDI3_fthetaFgFragmentShader = `
precision highp float;

#include <common>
uniform sampler2D uTexture;
uniform float uEffectRadius;

varying vec2 vUv;
varying float vS;

void main() {
#if defined(LAYER2)
  vec2 alpha_uv   = vec2(vUv.s * 0.33333 + 0.66666, vUv.t * 0.33333 + 0.66666);
  vec2 depth_uv   = vec2(vUv.s * 0.33333 + 0.33333, vUv.t * 0.33333 + 0.66666);
  vec2 texture_uv = vec2(vUv.s * 0.33333,           vUv.t * 0.33333 + 0.66666);
#else
  vec2 alpha_uv   = vec2(vUv.s * 0.33333 + 0.66666, vUv.t * 0.33333 + 0.33333);
  vec2 depth_uv   = vec2(vUv.s * 0.33333 + 0.33333, vUv.t * 0.33333 + 0.33333);
  vec2 texture_uv = vec2(vUv.s * 0.33333,           vUv.t * 0.33333 + 0.33333);
#endif

  vec3 rgb = texture2D(uTexture, texture_uv).rgb;
  float a = texture2D(uTexture, alpha_uv).r;

  // Transition effect
  float q = smoothstep(uEffectRadius - 0.02, uEffectRadius + 0.02, vS);
  rgb = mix(rgb, vec3(0.6, 0.5, 1.0), q);
  a *= smoothstep(uEffectRadius + 0.05, uEffectRadius, vS);

  if (a < 0.02) discard;

  gl_FragColor = vec4(rgb, a);
}
`;

const LDI3_fthetaBgVertexShader = `
precision highp float;
uniform sampler2D uTexture;
`
+ decode12bit +
`
varying vec2 vUv;
varying float vS;

void main() {
  vUv = uv;

  float depth_sample = decodeInverseDepth(vUv, vec2(0.33333333, 0.0));
  float s = clamp(0.3 / depth_sample, 0.01, 50.0);
  vS = s;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xyz * s, 1.0);
}
`;

const LDI3_fthetaBgFragmentShader = `
precision highp float;

#include <common>
uniform sampler2D uTexture;
uniform float uEffectRadius;
varying vec2 vUv;
varying float vS;

void main() {
  vec2 texture_uv = vec2(vUv.s * 0.33333, vUv.t * 0.33333);
  vec2 alpha_uv   = vec2(vUv.s * 0.33333 + 0.66666, vUv.t * 0.33333);
  float a = texture2D(uTexture, alpha_uv).r;
  vec3 rgb = texture2D(uTexture, texture_uv).rgb;

  // Transition effect
  float q = smoothstep(uEffectRadius - 0.02, uEffectRadius + 0.02, vS);
  rgb = mix(rgb, vec3(0.6, 0.5, 1.0), q);
  a *= smoothstep(uEffectRadius + 0.05, uEffectRadius, vS);

  if (a < 0.02) discard;
  gl_FragColor = vec4(rgb, a);
}
`;


//////////////////////////////////////
// 3. Ldi3Mesh //
//////////////////////////////////////
const NUM_LAYERS = 3;

/*
 That class is a THREE Object3D displaying a LDI.
 */
class Ldi3Mesh extends THREE.Object3D {
    layer_to_meshes = Array.from({ length: NUM_LAYERS }, () => []);

    ftheta_scale = null

    constructor(_decode_12bit, texture, _ftheta_scale = null) {

        super()
        this.ftheta_scale = 1.15;
      

        // Make the initial shader uniforms.
        this.uniforms = {
            uTexture: { value: texture },
            uEffectRadius: { value: 100.0 },  // Set to a lower value to play intro animation
        };

        // Make the foreground mesh material.
        var shader_prefix = "";
        if (_decode_12bit) shader_prefix += "#define DECODE_12BIT\n";

        //// LDI3 materials ////

        const ldi3_layer0_material = this.ldi3_layer0_material = new THREE.ShaderMaterial({
            vertexShader:   shader_prefix + LDI3_fthetaBgVertexShader,
            fragmentShader: shader_prefix + LDI3_fthetaBgFragmentShader,
            uniforms: this.uniforms,
            depthTest: true,
            depthWrite: true,
            transparent: true,
            wireframe: false
        });
        ldi3_layer0_material.side = THREE.BackSide;
        ldi3_layer0_material.depthFunc = THREE.LessDepth;

        const ldi3_layer1_material = this.ldi3_layer1_material = new THREE.ShaderMaterial({
            vertexShader:   shader_prefix + LDI3_fthetaFgVertexShader,
            fragmentShader: shader_prefix + LDI3_fthetaFgFragmentShader,
            uniforms: this.uniforms,
            depthTest: true,
            depthWrite: true,
            transparent: true,
            wireframe: false
        });
        ldi3_layer1_material.side = THREE.BackSide;
        ldi3_layer1_material.depthFunc = THREE.LessEqualDepth;

        const ldi3_layer2_material = this.ldi3_layer2_material = new THREE.ShaderMaterial({
            vertexShader:    "#define LAYER2\n" + shader_prefix + LDI3_fthetaFgVertexShader,
            fragmentShader:  "#define LAYER2\n" + shader_prefix + LDI3_fthetaFgFragmentShader,
            uniforms: this.uniforms,
            depthTest: true,
            depthWrite: true,
            transparent: true,
            wireframe: false
        });
        ldi3_layer2_material.side = THREE.BackSide;
        ldi3_layer2_material.depthFunc = THREE.LessEqualDepth;

        const inflation = 3.0;
        this.makeEquiangularMesh(ldi3_layer0_material, 128, 4, 0, inflation);
        this.makeEquiangularMesh(ldi3_layer1_material, 128, 4, 1, inflation);
        this.makeEquiangularMesh(ldi3_layer2_material, 96, 4, 2, inflation); // HACK: a few less triangles here to give some overhead on Quest Pro to not exceed triangle limit when displaying extra UI elements.
    }

    makeEquiangularMesh(material, GRID_SIZE, NUM_PATCHES, order, ftheta_inflation, is_oculus) {
        const NUM_QUADS_PER_SIDE = NUM_PATCHES * GRID_SIZE;
        const MARGIN = 2;

        for (var patch_j = 0; patch_j < NUM_PATCHES; ++patch_j) {
            for (var patch_i = 0; patch_i < NUM_PATCHES; ++patch_i) {
                const verts   = [];
                const indices = [];
                const uvs     = [];

                for (var j = 0; j <= GRID_SIZE; ++j) {
                    for (var i = 0; i <= GRID_SIZE; ++i) {
                        const ii = i + patch_i * GRID_SIZE;
                        const jj = j + patch_j * GRID_SIZE;
                        const u  = ii / NUM_QUADS_PER_SIDE;
                        const v  = jj / NUM_QUADS_PER_SIDE;

                        const a = 2.0 * (u - 0.5);
                        const b = 2.0 * (v - 0.5);
                        const theta = Math.atan2(b, a);
                        var r = Math.sqrt(a * a + b * b) / this.ftheta_scale;
                        r = 0.5 * r + 0.5 * Math.pow(r, ftheta_inflation);
                        const phi = r * Math.PI / 2.0;

                        const x = Math.cos(theta) * Math.sin(phi);
                        const y = Math.sin(theta) * Math.sin(phi);
                        const z = -Math.cos(phi);

                        verts.push(x, y, z);
                        uvs.push(u, v);
                    }
                }

                for (var j = 0; j < GRID_SIZE; ++j) {
                    for (var i = 0; i < GRID_SIZE; ++i) {
                        // Skip quads outside the image circle.
                        const ii = i + patch_i * GRID_SIZE;
                        const jj = j + patch_j * GRID_SIZE;
                        const di = ii - NUM_QUADS_PER_SIDE / 2;
                        const dj = jj - NUM_QUADS_PER_SIDE / 2;
                        if (di * di + dj * dj > (NUM_QUADS_PER_SIDE+MARGIN) * (NUM_QUADS_PER_SIDE+MARGIN) / 4) continue;

                        const a = i + (GRID_SIZE + 1) * j;
                        const b = a + 1;
                        const c = a + (GRID_SIZE + 1);
                        const d = c + 1;
                        indices.push(a, c, b);
                        indices.push(c, d, b);
                    }
                }

                if (indices.length > 0) {
                    const geometry = new THREE.BufferGeometry();
                    geometry.setIndex(indices);
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
                    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

                    const mesh = new THREE.Mesh(geometry, material);

                    this.layer_to_meshes[order].push(mesh);

                    mesh.frustumCulled = false;

                    mesh.renderOrder = order;
                    this.add(mesh);
                }
            }
        }

    }
}



//////////////////////////////////////
// 2. MAIN  //
//////////////////////////////////////
let container, camera, scene, renderer;
let format;
let error_message_div;
let media_mesh;
let world_group; // A THREE.Group that stores all of the meshes (foreground and background), so they can be transformed together by modifying the group.

let video;
let texture;
let is_buffering_at = performance.now();
let delay1frame_reset = false; // The sessionstart event happens one frame too early. We need to wait 1 frame to reset the view after entering VR.
let photo_mode = false;
let embed_mode = false;
let has_played_video = false;


const BUFFERING_TIMEOUT = 500;
const TRANSITION_ANIM_DURATION = 8000;
let transition_start_timer;
let enable_intro_animation;


var ua = navigator.userAgent;
var is_firefox = ua.indexOf("Firefox") != -1;
var is_oculus = (ua.indexOf("Oculus") != -1);
var is_chrome =  (ua.indexOf("Chrome")  != -1) || is_oculus;
var is_safarish =  (ua.indexOf("Safari")  != -1) && (!is_chrome || (ua.indexOf("Mac")  != -1)); // This can still be true on Chrome for Mac...
var is_ios = ua.match(/iPhone|iPad|iPod/i);

function byId(id) { return document.getElementById( id ); };

function filenameExtension(filename) { return filename.split('.').pop(); }

function loadJSON(json_path, callback) {
  var xobj = new XMLHttpRequest();
  xobj.overrideMimeType("application/json");
  xobj.open('GET', json_path, true);
  xobj.onreadystatechange = function() {
    if (xobj.readyState == 4 && xobj.status == "200") { callback(JSON.parse(xobj.responseText)); }
  };
  xobj.send(null);
}


function playVideoIfReady() {
  if (!video) return;

  video.play();
  has_played_video = true;
}

function pauseVideo() {
  if (photo_mode) return;

  nonvr_menu_fade_counter = 60;
  video.pause();
}




function startAnimatedTransitionEffect() {
  if (enable_intro_animation) {
    transition_start_timer = performance.now();
  }
}


function render() {
if (transition_start_timer) {
    const t = Math.min(1.0, (performance.now() - transition_start_timer) / TRANSITION_ANIM_DURATION);
    media_mesh.uniforms.uEffectRadius.value =
      Math.min(0.6 / ((1.0 - Math.pow(t, 0.2)) + 1e-6), 51); // HACK: the max radius of the mesh is 50, so this goes past it (which we want!)
  }
  // HACK: The video texture doesn't update as it should on Vision Pro, so here' well force it.
  if (is_safarish && video != undefined && !photo_mode && texture.source.data.videoWidth > 0) {
    texture.needsUpdate = true;
  }  
  // Render each layer in order, clearing the depth buffer between. This is important
  // to get alpha blending right.
  renderer.clearColor();
	renderer.clearDepth();
    let _min_fov;
    let _vfov = 75;
    let aspect_ratio = window.innerWidth / window.innerHeight;
    if (_min_fov && _vfov * aspect_ratio < _min_fov) {
      // For tall aspect ratios, ensure a minimum FOV
      _vfov = _min_fov / aspect_ratio;
    }
  
  world_group.visible = false;
  world_group.visible = true;
  renderer.render(scene, new THREE.PerspectiveCamera(_vfov, aspect_ratio, 0.1, 100));  // clears depth automatically (unwanted but unavoidable without warnings from THREE.js and hack workarounds).
}







function loadTexture(_media_urls, _loop, _autoplay_muted) {
  console.log("Loading texture from media urls: " + _media_urls);
  if (texture) {
    console.log("Deallocating texture " + texture);
    texture.dispose(); // Not clear if this helps or hurst as far as WebGL: context lost errors
    texture = null;
  }
  if (media_mesh && media_mesh.uniforms.uTexture) {
    media_mesh.uniforms.uTexture = null;
  }
  if (video) {
    // Delete the video sources to prevent a memory leak
    while(video.firstChild) {
      console.log("removing source", video.firstChild);
      video.removeChild(video.firstChild);
    }
    video.remove();
    video = null;
  }

  // Create a new <video> element
  var ext = filenameExtension(_media_urls[0]);
  if (ext == "png" || ext == "jpg") {
    photo_mode = true;
    texture = new THREE.TextureLoader().load(
      _media_urls[0],
      function(texture) {// onLoad callback
        is_buffering_at = false;
        if (!transition_start_timer) {
          startAnimatedTransitionEffect();
        }
      },
      function(xhr) { // Progress callback
        //const percentage = (xhr.loaded / xhr.total) * 100;
      },
      function(error) { // error callback
        error_message_div.innerHTML = "Error loading texture: "  + _media_urls[0];
      }
    );
    // Some of this isn't necessary, but makes the texture consistent between Photo/Video.
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter; // This matters! Fixes a rendering glitch.
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
  } else {
    is_buffering_at = performance.now();
    photo_mode = false;
    video = document.createElement('video');
    video.setAttribute("crossorigin", "anonymous");
    video.setAttribute("playsinline", true);
    video.loop = _loop;
    video.style.display = "none";
    video.preload = "auto";
    video.addEventListener("waiting", function() {
      is_buffering_at = performance.now();
    });
    video.addEventListener("playing", function() {
      if (!transition_start_timer) {
        startAnimatedTransitionEffect();
      }
      is_buffering_at = false;
    });
    video.addEventListener("canplay", function() {
      if (!transition_start_timer) {
        startAnimatedTransitionEffect();
      }
      is_buffering_at = false;
    });

    document.body.appendChild(video);

    // Create a <source> for each item in _media_urls
    for (let i = 0; i < _media_urls.length; i++) {
      let source = document.createElement('source');
      source.src = _media_urls[i];
      video.appendChild(source);
    }

    video.addEventListener("error", function() {
      error_message_div.innerHTML = "Failed to load videos: " + _media_urls;
    });

    if (_autoplay_muted) {
      video.muted = true;
      video.play().catch(e => {
        console.error("Error attempting to play video:", e.message);
      });
    }

    texture = new THREE.VideoTexture(video)
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
  }
  if (media_mesh) {
    media_mesh.uniforms.uTexture = texture;
  }
  if (media_mesh && format == "ldi3") {
    media_mesh.ldi3_layer0_material.uniforms.uTexture.value = texture;
    media_mesh.ldi3_layer1_material.uniforms.uTexture.value = texture;
    media_mesh.ldi3_layer2_material.uniforms.uTexture.value = texture;

    media_mesh.uniforms.uTexture.value.format = THREE.RGBAFormat;
    media_mesh.uniforms.uTexture.value.type = THREE.UnsignedByteType;
    media_mesh.uniforms.uTexture.value.minFilter = THREE.LinearFilter;
    media_mesh.uniforms.uTexture.value.magFilter = THREE.LinearFilter;
    media_mesh.uniforms.uTexture.value.generateMipmaps = false;

    media_mesh.ldi3_layer0_material.needsUpdate = true;
    media_mesh.ldi3_layer1_material.needsUpdate = true;
    media_mesh.ldi3_layer2_material.needsUpdate = true;
  }
}

function loadMedia(_media_urls, _loop = true, _autoplay_muted = true, _enable_intro_animation = true) {
  loadTexture(_media_urls, _loop, _autoplay_muted);
  if (_enable_intro_animation) {
    startAnimatedTransitionEffect();
  }
}
AFRAME.registerComponent("lifecast-component", {
  schema: {
    media_urls: { type: "array", default: ["orrery_transp_ldi3.jpg"], minLength: 1 },
    decode_12bit: { type: "boolean", default: true },
    enable_intro_animation: { type: "boolean", default: true },
  },
	init: function () {
	  ({
		_format = "ldi3", // ldi3
		_media_urls = this.data.media_urls,
		_ftheta_scale = null,	
		_decode_12bit = this.data.decode_12bit,
		_enable_intro_animation = this.data.enable_intro_animation,
		_autoplay_muted = true, // If this is a video, try to start playing immediately (muting is required)
		_loop = true,
		_transparent_bg = true, //  If you don't need transparency, it is faster to set this to false
	  } = {});
	  window.lifecast_player = this;

	  enable_intro_animation = _enable_intro_animation;
	  format = _format;
		let emptyDiv = document.createElement("div");
		emptyDiv.id = "volumetricVideo";
		this.el.appendChild(emptyDiv);
	  container = emptyDiv;
  
	  // Remove any existing children of the container (eg. loading spinner)
	  while (container.firstChild) {
		container.removeChild(container.firstChild);
	  }
  
	  if (new URLSearchParams(window.location.search).get("embed")) {
		embed_mode = true;
	  }
  
	  error_message_div = document.createElement("div");
	  container.appendChild(error_message_div);
  
	  loadTexture(_media_urls, _loop, _autoplay_muted);
  
	  camera = this.el.camera;
	  scene = this.el.object3D;
	  scene.background = new THREE.Color(0x000000);
		let canvas1 = emptyDiv;
		canvas1.style.display = "none";  
	  world_group = new THREE.Group();
	  world_group.position.set(0, 1.5, 0); // fix position
	  scene.add(world_group); 

  
	  if (format == "ldi3") {
		media_mesh = new Ldi3Mesh(_decode_12bit, texture, _ftheta_scale);
	  } else {
		console.error("Unsupported format: " + format);
	  }
	  world_group.add(media_mesh);
  
	  if (enable_intro_animation) {
		media_mesh.uniforms.uEffectRadius.value = 0.0;
	  }
  
	  renderer = new THREE.WebGLRenderer({
		antialias: true,
		//powerPreference: "high-performance",
		preserveDrawingBuffer: true,
		alpha: _transparent_bg,
	  });
	  renderer.autoClear = true;
	  renderer.autoClearColor = false;
	  renderer.autoClearDepth = true;
	  renderer.autoClearStencil = false;
  
	  if (_transparent_bg) {
		renderer.setClearColor(0xffffff, 0.0);
		scene.background = null;
	  }
	
  
	  container.appendChild(renderer.domElement);
  
	  container.style.position = "relative";
  
	 
	  document.addEventListener("keydown", function (event) {
		const key = event.key;
		if (key == "p") {
			pauseVideo();
		  }
		  if (key == "o") {
			playVideoIfReady()
		}
		
  
		if (key == "q") startAnimatedTransitionEffect();
	  });
  

  },
  tick: function () {
    renderer.setAnimationLoop( render );
  }
  });
  
  