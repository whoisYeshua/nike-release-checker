import pc from 'picocolors';
export const colorTheme = {
    slug: value => pc.magenta(value),
    model: value => pc.cyan(pc.bold(value)),
    importantText: value => pc.bold(value),
    highStock: value => pc.green(pc.bold(value)),
    midStock: value => pc.yellow(pc.bold(value)),
    lowStock: value => pc.red(pc.bold(value)),
    othersStock: value => pc.gray(pc.bold(value)),
};
