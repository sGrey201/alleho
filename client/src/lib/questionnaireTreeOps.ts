import type { QuestionnaireNode, QuestionnaireTag, QuestionnaireTemplateStructure } from "@shared/questionnaireTypes";

export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return items;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function getNodeAtPath(root: QuestionnaireNode[], path: number[]): QuestionnaireNode | null {
  if (path.length === 0) return null;
  let node = root[path[0]];
  if (!node) return null;
  for (let i = 1; i < path.length; i++) {
    const children = node.children ?? [];
    node = children[path[i]];
    if (!node) return null;
  }
  return node;
}

function updateListAtPath(
  list: QuestionnaireNode[],
  path: number[],
  pathIndex: number,
  updater: (node: QuestionnaireNode) => QuestionnaireNode
): QuestionnaireNode[] {
  if (pathIndex === path.length - 1) {
    const next = [...list];
    const idx = path[pathIndex];
    if (!next[idx]) return list;
    next[idx] = updater(next[idx]);
    return next;
  }
  const idx = path[pathIndex];
  const next = [...list];
  if (!next[idx]) return list;
  next[idx] = {
    ...next[idx],
    children: updateListAtPath(next[idx].children ?? [], path, pathIndex + 1, updater),
  };
  return next;
}

export function updateNodeAtPath(
  structure: QuestionnaireTemplateStructure,
  path: number[],
  updater: (node: QuestionnaireNode) => QuestionnaireNode
): QuestionnaireTemplateStructure {
  return { root: updateListAtPath(structure.root, path, 0, updater) };
}

function removeFromList(list: QuestionnaireNode[], path: number[], pathIndex: number): QuestionnaireNode[] {
  if (pathIndex === path.length - 1) {
    return list.filter((_, i) => i !== path[pathIndex]);
  }
  const idx = path[pathIndex];
  const next = [...list];
  if (!next[idx]) return list;
  next[idx] = {
    ...next[idx],
    children: removeFromList(next[idx].children ?? [], path, pathIndex + 1),
  };
  return next;
}

export function removeNodeAtPath(
  structure: QuestionnaireTemplateStructure,
  path: number[]
): QuestionnaireTemplateStructure {
  if (path.length === 0) return structure;
  return { root: removeFromList(structure.root, path, 0) };
}

export function moveNodeAtPath(
  structure: QuestionnaireTemplateStructure,
  path: number[],
  delta: number
): QuestionnaireTemplateStructure {
  if (path.length === 0) return structure;
  if (path.length === 1) {
    return { root: moveItem(structure.root, path[0], delta) };
  }
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return updateNodeAtPath(structure, parentPath, (node) => ({
    ...node,
    children: moveItem(node.children ?? [], index, delta),
  }));
}

export function getParentListLength(structure: QuestionnaireTemplateStructure, path: number[]): number {
  if (path.length === 1) return structure.root.length;
  const parent = getNodeAtPath(structure.root, path.slice(0, -1));
  return parent?.children?.length ?? 0;
}

export function updateTagAtPath(
  structure: QuestionnaireTemplateStructure,
  path: number[],
  tagIndex: number,
  updater: (tag: QuestionnaireTag) => QuestionnaireTag
): QuestionnaireTemplateStructure {
  return updateNodeAtPath(structure, path, (node) => {
    const tags = [...(node.tags ?? [])];
    if (!tags[tagIndex]) return node;
    tags[tagIndex] = updater(tags[tagIndex]);
    return { ...node, tags };
  });
}

export function removeTagAtPath(
  structure: QuestionnaireTemplateStructure,
  path: number[],
  tagIndex: number
): QuestionnaireTemplateStructure {
  return updateNodeAtPath(structure, path, (node) => ({
    ...node,
    tags: (node.tags ?? []).filter((_, i) => i !== tagIndex),
  }));
}

export function moveTagAtPath(
  structure: QuestionnaireTemplateStructure,
  path: number[],
  tagIndex: number,
  delta: number
): QuestionnaireTemplateStructure {
  return updateNodeAtPath(structure, path, (node) => ({
    ...node,
    tags: moveItem(node.tags ?? [], tagIndex, delta),
  }));
}

export function getTagCountAtPath(structure: QuestionnaireTemplateStructure, path: number[]): number {
  const node = getNodeAtPath(structure.root, path);
  return node?.tags?.length ?? 0;
}

export function newStructureId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
