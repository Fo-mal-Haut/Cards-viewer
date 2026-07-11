(() => {
  function nextFrame() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  async function appendInBatches(items, buildNode, target, options = {}) {
    const batchSize = Math.max(1, Number(options.batchSize) || 24);
    const shouldStop =
      typeof options.shouldStop === "function" ? options.shouldStop : null;
    const afterChunk =
      typeof options.afterChunk === "function" ? options.afterChunk : null;

    for (let index = 0; index < items.length; index += batchSize) {
      if (shouldStop && shouldStop()) return;

      const fragment = document.createDocumentFragment();
      const nodes = [];
      const chunk = items.slice(index, index + batchSize);
      for (const item of chunk) {
        const node = buildNode(item);
        if (node) {
          nodes.push(node);
          fragment.append(node);
        }
      }

      target.append(fragment);
      if (afterChunk && nodes.length) {
        afterChunk(nodes, chunk, index);
      }

      if (shouldStop && shouldStop()) return;
      await nextFrame();
    }
  }

  window.batchUtils = {
    appendInBatches,
  };
})();
