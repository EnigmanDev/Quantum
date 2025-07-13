// HTML HEAD MUST INCLUDE:
// <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
// <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

// JS FILE:
document.addEventListener('DOMContentLoaded', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    document.getElementById('simulation-container').appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 10;
    controls.maxDistance = 500;
    controls.maxPolarAngle = Math.PI / 2;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1.2);
    pointLight.position.set(100, 100, 100);
    scene.add(pointLight);

    const renderScene = new THREE.RenderPass(scene, camera);
    const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    const composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    const statsContent = document.getElementById('stats-content');
    const equationsContent = document.getElementById('equations-content');
    const timeSlider = document.getElementById('time-slider');
    const particleSlider = document.getElementById('particle-slider');
    const sizeSlider = document.getElementById('size-slider');
    const toggleGpu = document.getElementById('toggle-gpu');
    const toggleTrails = document.getElementById('toggle-trails');
    const focusBtn = document.getElementById('focus-btn');
    const restartBtn = document.getElementById('restart-btn');
    const focusInfo = document.getElementById('focus-info');

    let particles = [], totalCollisions = 0, simulationSize = 50;
    let useGpu = true, focusedParticle = null, showTrails = true;

    const particleTypes = {
        electron: { color: 0x00ff00, size: 1.0, mass: 0.511, spin: 0.5 },
        photon: { color: 0xff0000, size: 0.5, mass: 0, spin: 1 },
        quark: { color: 0x0000ff, size: 1.5, mass: 2.2, spin: 0.5 },
    };

    function startSimulation() {
        particles.forEach(p => {
            scene.remove(p.mesh);
            if (p.trail) scene.remove(p.trail);
        });
        particles = [];
        totalCollisions = 0;
        focusedParticle = null;
        simulationSize = parseInt(sizeSlider.value);
        useGpu = toggleGpu.checked;
        showTrails = toggleTrails.checked;

        const particleCount = parseInt(particleSlider.value);
        for (let i = 0; i < particleCount; i++) {
            const type = i % 3 === 0 ? 'quark' : (i % 2 === 0 ? 'electron' : 'photon');
            createParticle(type);
        }
        renderEquations();
    }

    function createParticle(type) {
    const pType = particleTypes[type];
    const material = new THREE.MeshStandardMaterial({ color: pType.color, metalness: 0.7, roughness: 0.3 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(pType.size, 32, 32), material);

    const particle = {
        mesh: mesh,
        type: type,
        mass: pType.mass,
        spin: pType.spin,
        charge: type === 'quark' ? (Math.random() < 0.5 ? 2/3 : -1/3) : 0, // add quark charge
        velocity: new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(5),
        collisions: 0,
        trail: null
    };

    if (showTrails) {
        const trailMaterial = new THREE.LineBasicMaterial({ color: pType.color, transparent: true, opacity: 0.7 });
        const trailGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(200 * 3);
        trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particle.trail = new THREE.Line(trailGeometry, trailMaterial);
        scene.add(particle.trail);
    }

    mesh.position.set(
        (Math.random() - 0.5) * simulationSize,
        (Math.random() - 0.5) * simulationSize,
        (Math.random() - 0.5) * simulationSize
    );

    particles.push(particle);
    scene.add(mesh);
}

    function updatePhysics(timeFactor) {
    if (!useGpu) {
        for (let i = 0; i < particles.length; i++) {
            const p1 = particles[i];

            // Add quark 'gluon-like' jittery behavior
            if (p1.type === 'quark') {
                const jitter = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.5,
                    (Math.random() - 0.5) * 0.5,
                    (Math.random() - 0.5) * 0.5
                );
                p1.velocity.add(jitter);
                p1.velocity.clampLength(0, 10); // avoid infinite chaos
            }

            p1.mesh.position.add(p1.velocity.clone().multiplyScalar(timeFactor));

            // Boundary collision
            for (let axis of ['x', 'y', 'z']) {
                if (Math.abs(p1.mesh.position[axis]) > simulationSize / 2) {
                    p1.velocity[axis] *= -1;
                }
            }

            for (let j = i + 1; j < particles.length; j++) {
                const p2 = particles[j];
                const distance = p1.mesh.position.distanceTo(p2.mesh.position);
                const minDist = particleTypes[p1.type].size + particleTypes[p2.type].size;

                if (distance < minDist) {
                    if (p1.type === 'quark' && p2.type === 'quark') {
                        handleQuarkCollision(p1, p2);
                    } else {
                        handleCollision(p1, p2);
                    }
                    totalCollisions++;
                }
            }
        }
    }
}

    function handleQuarkCollision(q1, q2) {
    // Add realistic features for quarks: attraction or spin reversal
    const repulsion = q1.charge * q2.charge < 0 ? 1 : -1; // Opposite charges attract
    const direction = q1.mesh.position.clone().sub(q2.mesh.position).normalize();

    const forceMagnitude = repulsion * 0.5; // Weak attractive/repulsive force
    q1.velocity.add(direction.multiplyScalar(forceMagnitude));
    q2.velocity.add(direction.multiplyScalar(-forceMagnitude));

    // Optional: Randomize spin slightly (fake QCD interaction)
    q1.spin *= Math.random() > 0.5 ? 1 : -1;
    q2.spin *= Math.random() > 0.5 ? 1 : -1;

    q1.collisions++;
    q2.collisions++;
}

    function updateTrails() {
        if (!showTrails) return;
        particles.forEach(p => {
            if (p.trail) {
                const positions = p.trail.geometry.attributes.position.array;
                for (let i = positions.length - 1; i > 2; i--) {
                    positions[i] = positions[i - 3];
                }
                positions[0] = p.mesh.position.x;
                positions[1] = p.mesh.position.y;
                positions[2] = p.mesh.position.z;
                p.trail.geometry.attributes.position.needsUpdate = true;
            }
        });
    }

    function renderEquations() {
    const equations = `
  <p><strong>Time-Dependent Schrödinger Equation:</strong></p>
  $$ i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\mathbf{r},t) = \\left[ -\\frac{\\hbar^2}{2m} \\nabla^2 + V(\\mathbf{r},t) \\right] \\Psi(\\mathbf{r},t) $$

  <p><strong>Heisenberg Uncertainty Principle:</strong></p>
  $$ \\Delta x \\Delta p \\ge \\frac{\\hbar}{2} $$

  <p><strong>De Broglie Wavelength:</strong></p>
  $$ \\lambda = \\frac{h}{p} $$

  <p><strong>Relativistic Energy-Momentum Relation:</strong></p>
  $$ E^2 = (pc)^2 + (mc^2)^2 $$

  <p><strong>Simplified Elastic Collision (for this simulation):</strong></p>
  $$ v_1' = v_2, \\quad v_2' = v_1 $$
`;


        equationsContent.innerHTML = equations;
        if (typeof MathJax !== 'undefined') {
            MathJax.typesetPromise();
        }
    }

    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();
        const timeFactor = parseFloat(timeSlider.value) * delta * 20;

        updatePhysics(timeFactor);
        updateTrails();

        controls.update();
        camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.0005);
        camera.lookAt(scene.position);

        statsContent.innerHTML = `
            FPS: ${Math.round(1 / delta)}<br>
            Particles: ${particles.length}<br>
            Collisions: ${totalCollisions}<br>
            GPU Active: ${useGpu}
        `;

        if (focusedParticle) {
            camera.position.copy(focusedParticle.mesh.position).add(new THREE.Vector3(0, 0, 50));
            controls.target.copy(focusedParticle.mesh.position);
            focusInfo.style.display = 'block';
            focusInfo.innerHTML = `
                <strong>Focus: ${focusedParticle.type}</strong><br>
                Energy: ${(0.5 * focusedParticle.mass * focusedParticle.velocity.lengthSq()).toFixed(2)} MeV<br>
                Momentum: ${focusedParticle.velocity.length().toFixed(2)} MeV/c<br>
                Collisions: ${focusedParticle.collisions}
            `;
        } else {
            focusInfo.style.display = 'none';
        }

        composer.render();
    }

    restartBtn.addEventListener('click', startSimulation);
    toggleTrails.addEventListener('change', (e) => {
        showTrails = e.target.checked;
        if (showTrails) {
            particles.forEach(p => {
                if (!p.trail) {
                    const trailMaterial = new THREE.LineBasicMaterial({ color: p.mesh.material.color, transparent: true, opacity: 0.7 });
                    const trailGeometry = new THREE.BufferGeometry();
                    const positions = new Float32Array(200 * 3);
                    trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    p.trail = new THREE.Line(trailGeometry, trailMaterial);
                    scene.add(p.trail);
                }
            });
        } else {
            particles.forEach(p => {
                if (p.trail) {
                    scene.remove(p.trail);
                    p.trail = null;
                }
            });
        }
    });
    focusBtn.addEventListener('click', () => {
        if (focusedParticle) {
            focusedParticle = null;
            focusBtn.innerText = 'Focus on Quark';
            controls.autoRotate = true;
        } else {
            const quarks = particles.filter(p => p.type === 'quark');
            if (quarks.length > 0) {
                focusedParticle = quarks[Math.floor(Math.random() * quarks.length)];
                focusBtn.innerText = 'Exit Focus';
                controls.autoRotate = false;
            }
        }
    });

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.position.z = 100;
    startSimulation();
    animate();
});
