# Motion implementation

The supplied soda reference is adapted to a virtual casino: the centrepiece is a CSS 3D roulette wheel and game illustrations; floating tokens replace fruit, game cards replace flavor products. There is no product pricing or payment flow.

Exact atmosphere colors: classic #0b8a78 / #044e3b / #011411; blue #0b4f8a / #04294e / #010c14. Pink #fbcfe8; ink #011d17.
GSAP background transition: 1.5s power2.inOut. Switching: 360deg + blur15px over .6s power2.in, then 720deg + blur0 over 1.5s back.out(.7). The selected game remains server-backed and independent of decorative motion.
Bubbles spawn every400ms, capped26, last4–10s. Cursor smoothing .05, object tilt40deg/20deg, token parallax60/-30. CSS float +/-20px. Reduced motion and an explicit pause button disable continuous motion; offscreen and hidden tabs stop the RAF and bubble interval. Scene teardown cancels tweens and listeners.

GSAP 3.15.0 is vendored unmodified from https://github.com/greensock/GSAP/blob/master/dist/gsap.min.js. Its copyright and license header are retained. License terms: https://gsap.com/standard-license.
Illustrations remain locally hosted OpenMoji: see IMAGE-CREDITS.md. No third-party runtime scripts, font hosts, model downloads, or CSP relaxations are needed.

The reference's model-viewer/GLB can and flavor textures are replaced by casino UI objects. Rotation is CSS 3D, not a GLB model. Cyrillic display text uses Georgia, with Galada as the requested optional family if installed.
