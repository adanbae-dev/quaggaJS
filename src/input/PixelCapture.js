import {memoize} from 'lodash';
import {
    computeGray,
    computeImageArea,
} from '../common/cv_utils';
import {sleep, getViewport} from '../common/utils';
import {aquire} from '../common/buffers';

const TO_RADIANS = Math.PI / 180;

function adjustCanvasSize(input, canvas) {
    if (input instanceof HTMLVideoElement) {
        if (canvas.height !== input.videoHeight || canvas.width !== input.videoWidth) {
            console.log('adjusting canvas size', input.videoHeight, input.videoWidth);
            canvas.height = input.videoHeight;
            canvas.width = input.videoWidth;
            return true;
        }
        return false;
    } else if (typeof input.width !== 'undefined') {
        if (canvas.height !== input.height || canvas.width !== input.width) {
            console.log('adjusting canvas size', input.height, input.width);
            canvas.height = input.height;
            canvas.width = input.width;
            return true;
        }
        return false;
    } else {
        throw new Error('Not a video element!');
    }
}

function getOrCreateCanvas(source, target) {
    const $viewport = getViewport(target);
    let $canvas = $viewport.querySelector("canvas.imgBuffer");
    if (!$canvas) {
        $canvas = document.createElement("canvas");
        $canvas.className = "imgBuffer";
        if ($viewport && source.type === "IMAGE") {
            $viewport.appendChild($canvas);
        }
    }
    return $canvas;
}

function drawImage(
    canvasSize,
    ctx,
    source,
    drawable,
    ...drawImageArgs
) {
    let drawAngle = 0;
    if (source.type === 'IMAGE') {
        if (source.tags && source.tags.orientation) {
            switch(source.tags.orientation) {
            case 6:
                drawAngle = 90 * TO_RADIANS;
                break;
            case 8:
                drawAngle = -90 * TO_RADIANS;
                break;
            }
        }
    }

    const [,,,,,, dWidth, dHeight] = drawImageArgs;
    if (drawAngle !== 0) {
        ctx.translate(canvasSize.width / 2, canvasSize.height / 2);
        ctx.rotate(drawAngle);
        ctx.drawImage(drawable, -dHeight / 2, -dWidth / 2, dHeight, dWidth);
        ctx.rotate(-drawAngle);
        ctx.translate(-canvasSize.width / 2, -canvasSize.height / 2);
    } else {
        ctx.drawImage(drawable, ...drawImageArgs);
    }
}

export function fromSource(source, {target = "#interactive.viewport"} = {}) {
    var drawable = source.getDrawable();
    var $canvas = null;
    var ctx = null;

    if (drawable instanceof HTMLVideoElement
          || drawable instanceof HTMLImageElement) {
        $canvas = getOrCreateCanvas(source, target);
        ctx = $canvas.getContext('2d');
    }

    if (drawable instanceof HTMLCanvasElement) {
        $canvas = drawable;
        ctx = drawable.getContext('2d');
    }

    function nextAvailableBuffer(bytesRequired) {
        return new Uint8Array(aquire(bytesRequired));
    }

    return {
        grabFrameData: function grabFrameData({clipping} = {}) {
            const frame = source.getDrawable();
            const {viewport, canvas: canvasSize} = source.getDimensions();
            const sx = viewport.x;
            const sy = viewport.y;
            const sWidth = viewport.width;
            const sHeight = viewport.height;
            const dx = 0;
            const dy = 0;
            const dWidth = canvasSize.width;
            const dHeight = canvasSize.height;
            const {colorChannels = 3} = source;

            clipping = clipping ? clipping(canvasSize) : {
                x: 0,
                y: 0,
                width: canvasSize.width,
                height: canvasSize.height,
            };

            adjustCanvasSize(canvasSize, $canvas);
            if ($canvas.height < 10 || $canvas.width < 10) {
                return sleep(100).then(grabFrameData);
            }

            if (!(frame instanceof HTMLCanvasElement)) {
                drawImage(
                    canvasSize,
                    ctx,
                    source,
                    frame,
                    sx,
                    sy,
                    sWidth,
                    sHeight,
                    dx,
                    dy,
                    dWidth,
                    dHeight
                );
            }
            var imageData = ctx.getImageData(
                clipping.x,
                clipping.y,
                clipping.width,
                clipping.height
            ).data;
            var imageBuffer = nextAvailableBuffer(clipping.width * clipping.height);
            computeGray(imageData, imageBuffer, {singleChannel: colorChannels === 1});
            return Promise.resolve({
                width: clipping.width,
                height: clipping.height,
                dimensions: {
                    viewport,
                    canvas: canvasSize,
                    clipping,
                },
                data: imageBuffer,
            });
        },
        getSource: function() {
            return source;
        },
        getCanvas: function() {
            return $canvas;
        },
        getCaptureSize() {
            return source.getDimensions().canvas;
        },

    };
}
