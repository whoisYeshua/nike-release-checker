import fsPromises from 'node:fs/promises'
import process from 'node:process'

import { useEffect, useState } from 'react'
import chalk from 'chalk'
import { Text } from 'ink'
import { intToRGBA, Jimp } from 'jimp'

export type ImageProps = {
	readonly src: ArrayBuffer | string
	readonly width?: number | string
	readonly height?: number | string
	readonly preserveAspectRatio?: boolean
}

export const Image = ({
	src,
	width = '100%',
	height = '100%',
	preserveAspectRatio = true,
}: ImageProps) => {
	const [imageData, setImageData] = useState('')

	useEffect(() => {
		;(async () => {
			let imageData
			if (src instanceof ArrayBuffer) {
				const buffer = Buffer.from(src)
				imageData = await imageBuffer(buffer, { width, height, preserveAspectRatio })
			} else {
				imageData = await imageFile(src, { width, height, preserveAspectRatio })
			}
			setImageData(imageData)
		})()
	}, [src, width, height, preserveAspectRatio])

	return <Text>{imageData}</Text>
}

// `log-update` adds an extra newline so the generated frames need to be 2 pixels shorter.
const ROW_OFFSET = 2

const PIXEL = '\u2584'

function scale(width: number, height: number, originalWidth: number, originalHeight: number) {
	const originalRatio = originalWidth / originalHeight
	const factor = width / height > originalRatio ? height / originalHeight : width / originalWidth
	width = factor * originalWidth
	height = factor * originalHeight
	return { width, height }
}

function checkAndGetDimensionValue(value: string | number, percentageBase: number) {
	if (typeof value === 'string' && value.endsWith('%')) {
		const percentageValue = Number.parseFloat(value)
		if (!Number.isNaN(percentageValue) && percentageValue > 0 && percentageValue <= 100) {
			return Math.floor((percentageValue / 100) * percentageBase)
		}
	}

	if (typeof value === 'number') {
		return value
	}

	throw new Error(`${value} is not a valid dimension value`)
}

function calculateWidthHeight(
	imageWidth: number,
	imageHeight: number,
	inputWidth: number | string,
	inputHeight: number | string,
	preserveAspectRatio: boolean
) {
	const terminalColumns = process.stdout.columns || 80
	const terminalRows = process.stdout.rows - ROW_OFFSET || 24

	let width
	let height

	if (inputHeight && inputWidth) {
		width = checkAndGetDimensionValue(inputWidth, terminalColumns)
		height = checkAndGetDimensionValue(inputHeight, terminalRows) * 2

		if (preserveAspectRatio) {
			;({ width, height } = scale(width, height, imageWidth, imageHeight))
		}
	} else if (inputWidth) {
		width = checkAndGetDimensionValue(inputWidth, terminalColumns)
		height = (imageHeight * width) / imageWidth
	} else if (inputHeight) {
		height = checkAndGetDimensionValue(inputHeight, terminalRows) * 2
		width = (imageWidth * height) / imageHeight
	} else {
		;({ width, height } = scale(terminalColumns, terminalRows * 2, imageWidth, imageHeight))
	}

	if (width > terminalColumns) {
		;({ width, height } = scale(terminalColumns, terminalRows * 2, width, height))
	}

	width = Math.round(width)
	height = Math.round(height)

	return { width, height }
}

type RenderOptions = {
	width?: number | string
	height?: number | string
	preserveAspectRatio?: boolean
}

const START_Y = 4
const END_Y = 3

async function render(
	buffer: Buffer<ArrayBufferLike>,
	{ width: inputWidth, height: inputHeight, preserveAspectRatio }: Required<RenderOptions>
) {
	const image = await Jimp.fromBuffer(Buffer.from(buffer))
	const { bitmap } = image

	const { width, height } = calculateWidthHeight(
		bitmap.width,
		bitmap.height,
		inputWidth,
		inputHeight,
		preserveAspectRatio
	)

	image.resize({ w: width, h: height })

	let result = ''
	for (let y = 0; y < bitmap.height - 1; y += 2) {
		if (y < START_Y || y > bitmap.height - END_Y) continue

		for (let x = 0; x < bitmap.width; x++) {
			const { r, g, b, a } = intToRGBA(image.getPixelColor(x, y))
			const { r: r2, g: g2, b: b2 } = intToRGBA(image.getPixelColor(x, y + 1))
			result += a === 0 ? chalk.reset(' ') : chalk.bgRgb(r, g, b).rgb(r2, g2, b2)(PIXEL)
		}

		result += '\n'
	}

	return result
}

const imageBuffer = async (
	buffer: Buffer<ArrayBufferLike>,
	{ width = '100%', height = '100%', preserveAspectRatio = true }: RenderOptions = {}
) => render(buffer, { height, width, preserveAspectRatio })

const imageFile = async (filePath: string, options: RenderOptions = {}) =>
	imageBuffer(await fsPromises.readFile(filePath), options)
