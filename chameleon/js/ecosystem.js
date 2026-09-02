(function() {
  "use strict";

  var layer = document.getElementById("prey-layer");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var controller = window.chameleonController || null;
  var activeHunt = null;
  var nextHuntAt = performance.now() + 3600;

  var insectSpecs = [
    { id: "bee", image: "chameleon/img/generated/bee.webp", duration: 19000, delay: 350, direction: 1, path: beePath },
    { id: "mosquito", image: "chameleon/img/generated/mosquito.webp", duration: 22500, delay: 1800, direction: -1, path: mosquitoPath },
    { id: "ant", image: "chameleon/img/generated/ant.webp", duration: 28500, delay: 900, direction: 1, path: antPath }
  ];

  var insects = insectSpecs.map(createInsect);

  function createInsect(spec, index) {
    var element = document.createElement("div");
    var image = document.createElement("img");

    element.className = "prey prey--" + spec.id;
    element.dataset.prey = spec.id;
    image.className = "prey__sprite";
    image.src = spec.image;
    image.alt = "";
    image.draggable = false;
    element.appendChild(image);
    layer.appendChild(element);

    return {
      id: spec.id,
      element: element,
      path: spec.path,
      duration: spec.duration,
      direction: spec.direction,
      phase: index * 1.73 + 0.45,
      startedAt: performance.now() + spec.delay,
      visible: false,
      caught: false,
      position: { x: -120, y: -120, tilt: 0 }
    };
  }

  function lerp(from, to, amount) {
    return from + (to - from) * amount;
  }

  function easeInOut(amount) {
    return amount < 0.5 ? 2 * amount * amount : 1 - Math.pow(-2 * amount + 2, 2) / 2;
  }

  function beePath(progress, insect) {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var travel = insect.direction > 0 ? progress : 1 - progress;
    return {
      x: lerp(-90, width + 90, travel),
      y: height * (0.27 + 0.072 * Math.sin(progress * Math.PI * 4 + insect.phase)
        + 0.018 * Math.sin(progress * Math.PI * 11)),
      tilt: 5 * Math.sin(progress * Math.PI * 5 + insect.phase)
    };
  }

  function mosquitoPath(progress, insect) {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var travel = insect.direction > 0 ? progress : 1 - progress;
    return {
      x: lerp(-100, width + 100, travel),
      y: height * (0.49 + 0.115 * Math.sin(progress * Math.PI * 5 + insect.phase)
        + 0.026 * Math.sin(progress * Math.PI * 17)),
      tilt: 8 * Math.sin(progress * Math.PI * 9)
    };
  }

  function antPath(progress, insect) {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var travel = insect.direction > 0 ? progress : 1 - progress;
    return {
      x: lerp(-80, width + 80, travel),
      y: height * (0.79 + 0.009 * Math.sin(progress * Math.PI * 18 + insect.phase)),
      tilt: 1.8 * Math.sin(progress * Math.PI * 12)
    };
  }

  function placeInsect(insect, position) {
    insect.position = position;
    insect.element.style.setProperty("--x", position.x.toFixed(2) + "px");
    insect.element.style.setProperty("--y", position.y.toFixed(2) + "px");
    insect.element.style.setProperty("--tilt", position.tilt.toFixed(2) + "deg");
    insect.element.style.setProperty("--direction", String(insect.direction));
  }

  function showInsect(insect) {
    insect.visible = true;
    insect.caught = false;
    insect.element.classList.remove("is-caught", "is-targeted");
    insect.element.classList.add("is-visible");
  }

  function scheduleRespawn(insect, now) {
    insect.visible = false;
    insect.caught = false;
    insect.element.classList.remove("is-visible", "is-caught", "is-targeted");
    insect.direction *= -1;
    insect.startedAt = now + 2600 + Math.random() * 3600;
  }

  function updateFreeInsect(insect, now) {
    if (now < insect.startedAt) {
      return;
    }
    if (!insect.visible) {
      showInsect(insect);
    }
    var progress = (now - insect.startedAt) / insect.duration;
    if (progress >= 1) {
      scheduleRespawn(insect, now);
      return;
    }
    placeInsect(insect, insect.path(progress, insect));
  }

  function beginHunt(insect, now) {
    if (!controller || activeHunt || controller.isBusy()) {
      return;
    }
    var mouth = controller.getMouthPoint();
    var reach = controller.getReach();
    if (!mouth || !reach) {
      return;
    }

    var dx = insect.position.x - mouth.x;
    var dy = insect.position.y - mouth.y;
    var length = Math.sqrt(dx * dx + dy * dy) || 1;
    var target = {
      x: mouth.x + dx / length * reach,
      y: mouth.y + dy / length * reach,
      tilt: insect.position.tilt
    };

    activeHunt = {
      insect: insect,
      startedAt: now,
      from: { x: insect.position.x, y: insect.position.y, tilt: insect.position.tilt },
      target: target,
      tongueStartedAt: 0,
      caughtAt: 0
    };
    insect.element.classList.add("is-targeted");
  }

  function updateHunt(now) {
    var hunt = activeHunt;
    if (!hunt) {
      return;
    }

    var approach = Math.min(1, (now - hunt.startedAt) / 260);
    var eased = easeInOut(approach);
    var position = {
      x: lerp(hunt.from.x, hunt.target.x, eased),
      y: lerp(hunt.from.y, hunt.target.y, eased),
      tilt: lerp(hunt.from.tilt, hunt.target.tilt, eased)
    };
    placeInsect(hunt.insect, position);
    controller.setTarget(position.x, position.y, hunt.insect.id);

    if (hunt.caughtAt && now >= hunt.caughtAt && !hunt.insect.caught) {
      hunt.insect.caught = true;
      hunt.insect.element.classList.remove("is-targeted");
      hunt.insect.element.classList.add("is-caught");
    }

    if (!hunt.tongueStartedAt && now - hunt.startedAt > 1400) {
      abortHunt(now);
    }
  }

  function abortHunt(now) {
    if (!activeHunt) {
      return;
    }
    activeHunt.insect.element.classList.remove("is-targeted");
    controller.releaseTarget(activeHunt.insect.id);
    activeHunt = null;
    nextHuntAt = now + 2600;
  }

  function finishHunt(now) {
    if (!activeHunt) {
      return;
    }
    var insect = activeHunt.insect;
    controller.releaseTarget(insect.id);
    scheduleRespawn(insect, now);
    activeHunt = null;
    nextHuntAt = now + 4600 + Math.random() * 3200;
  }

  function findHuntCandidate(now) {
    if (!controller || activeHunt || now < nextHuntAt || controller.isBusy()) {
      return;
    }
    var mouth = controller.getMouthPoint();
    var reach = controller.getReach();
    if (!mouth || !reach) {
      return;
    }

    var tolerance = Math.max(24, reach * 0.065);
    var candidate = null;
    var candidateDelta = Infinity;

    insects.forEach(function(insect) {
      if (!insect.visible || insect.caught) {
        return;
      }
      var dx = insect.position.x - mouth.x;
      var dy = insect.position.y - mouth.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var delta = Math.abs(distance - reach);
      if (delta < tolerance && delta < candidateDelta) {
        candidate = insect;
        candidateDelta = delta;
      }
    });

    if (candidate) {
      beginHunt(candidate, now);
    }
  }

  function frame(now) {
    if (!reduceMotion && document.visibilityState !== "hidden") {
      insects.forEach(function(insect) {
        if (!activeHunt || activeHunt.insect !== insect) {
          updateFreeInsect(insect, now);
        }
      });
      updateHunt(now);
      findHuntCandidate(now);
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener("chameleon:ready", function(event) {
    controller = event.detail;
  });

  window.addEventListener("chameleon:tongue-start", function(event) {
    if (!activeHunt || event.detail.owner !== activeHunt.insect.id) {
      return;
    }
    activeHunt.tongueStartedAt = performance.now();
    activeHunt.caughtAt = activeHunt.tongueStartedAt + 320;
  });

  window.addEventListener("chameleon:tongue-end", function(event) {
    if (activeHunt && event.detail.owner === activeHunt.insect.id) {
      finishHunt(performance.now());
    }
  });

  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "visible") {
      var now = performance.now();
      insects.forEach(function(insect, index) {
        insect.startedAt = now + index * 520;
        insect.visible = false;
        insect.element.classList.remove("is-visible", "is-caught", "is-targeted");
      });
      if (activeHunt && controller) {
        controller.releaseTarget(activeHunt.insect.id);
      }
      activeHunt = null;
      nextHuntAt = now + 2800;
    }
  });

  requestAnimationFrame(frame);
})();
