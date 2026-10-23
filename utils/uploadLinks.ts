export const moveUploadLink = <T>(
    list: T[],
    index: number,
    direction: -1 | 1,
): boolean => {
    const target = index + direction;
    if (index < 0 || index >= list.length) return false;
    if (target < 0 || target >= list.length) return false;
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item!);
    return true;
};
