const babelConfig = api => {
  // This caches the Babel config (https://babeljs.io/docs/en/config-files#apicache:~:text=Since%20the%20actual%20callback%20result%20is%20used%20to%20check%20if%20the%20cache%20entry%20is%20valid%2C%20it%20is%20recommended%20that%3A)
  api.cache.using(() => process.env.NODE_ENV === 'development')

  const presets = [
    // Enable development transform of React with new automatic runtime (https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html)
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ]

  return { presets }
}

module.exports = babelConfig
