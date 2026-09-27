function cropRectangle(rect, bounds, size) {
  if (!rect || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(rect[k]))) throw new Error('Nieprawidłowe zaznaczenie.');
  const x = Math.max(0, Math.round(rect.x * size.width / bounds.width));
  const y = Math.max(0, Math.round(rect.y * size.height / bounds.height));
  const width = Math.min(size.width - x, Math.round(rect.width * size.width / bounds.width));
  const height = Math.min(size.height - y, Math.round(rect.height * size.height / bounds.height));
  if (width < 3 || height < 3) throw new Error('Zaznacz większy fragment ekranu.');
  return { x, y, width, height };
}
module.exports = { cropRectangle };
