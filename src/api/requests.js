import axios from 'axios'

export const getDataJSON = async (country, language) => {
  let url = new URL('https://api.nike.com/product_feed/threads/v2/')
  url.searchParams.append('filter', `marketplace(${country})`)
  url.searchParams.append('filter', `language(${language})`)
  url.searchParams.append(
    'filter',
    'channelId(010794e5-35fe-4e32-aaff-cd2c74f89d61)'
  )
  url.searchParams.append('filter', 'upcoming(true)')
  url.searchParams.append('filter', 'exclusiveAccess(true,false)')

  const config = {
    method: 'get',
    url: `${url}`,
    headers: {},
  }

  try {
    const response = await axios(config)
    return response.data
  } catch (error) {
    console.error(error.message)
  }
}

export const getDataBuffer = async url => {
  const config = {
    method: 'get',
    url: url,
    responseType: 'arraybuffer',
    headers: {},
  }

  try {
    const response = await axios(config)
    return response.data
  } catch (error) {
    console.error(error.message)
  }
}
