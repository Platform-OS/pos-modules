module.exports = {
  mode: 'jit',

  presets: [require('./tailwind.custom.config')],

  theme: {
    borderColor: (theme) => ({
      ...theme('colors'),
      DEFAULT: theme('colors.frame'),
    }),
    ringColor: (theme) => ({
      ...theme('colors'),
      DEFAULT: theme('colors.interaction.hover'),
    }),

    ringOpacity: (theme) => ({
      ...theme('opacity'),
      DEFAULT: 1,
    }),
  },

  variants: {
    borderWidth: ['responsive', 'hover', 'last'],
    margin: ['responsive', 'first', 'last'],
    padding: ['responsive', 'last'],
    ringWidth: ['focus-visible'],
    fill: ['hover']
  },

  purge: {
    content: [
      '**/*.liquid',
      './src/js/**/*.js',
      '../public/**/*.liquid',
      '../modules/**/*.liquid',
      '../modules/**/*.js'
    ],
    options: {
      keyframes: true,
    },
  },
};
