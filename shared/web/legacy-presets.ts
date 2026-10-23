// Original bundled examples, used only to upgrade untouched local copies.
export const legacyPresets = [
  { name: 'Aurora', description: 'A slow drift through violet and teal', colors: ['#967aff', '#37d7b0'], source: `function setup()\n  phase = 0\nend\n\nfunction loop()\n  phase = luxio_millis() / 2600\n  for i = 0, luxio_get_pixel_count() - 1 do\n    local t = (math.sin(i / 9 + phase) + 1) / 2\n    luxio_set_pixel_color(i, math.floor(45 + 105 * t),\n      math.floor(210 - 120 * t), math.floor(175 + 80 * t))\n  end\nend` },
  { name: 'Ember', description: 'The quiet glow of a fading fire', colors: ['#ff7b3a', '#d13248'], source: `function setup() end\n\nfunction loop()\n  local t = luxio_millis() / 1000\n  for i = 0, luxio_get_pixel_count() - 1 do\n    local glow = (math.sin(i * 0.7 + t) + 1) / 2\n    luxio_set_pixel_color(i, math.floor(140 + 115 * glow),\n      math.floor(18 + 60 * glow), math.floor(5 + 10 * glow))\n  end\nend` },
  { name: 'Tidal', description: 'Deep blue, moving at its own pace', colors: ['#275bff', '#55dce5'], source: `function setup() end\n\nfunction loop()\n  local t = luxio_millis() / 1800\n  for i = 0, luxio_get_pixel_count() - 1 do\n    local wave = (math.sin(i / 5 - t) + 1) / 2\n    luxio_set_pixel_color(i, 12, math.floor(30 + wave * 150),\n      math.floor(100 + wave * 155))\n  end\nend` },
  { name: 'Rose', description: 'Soft pink with a gentle breath', colors: ['#f38fb9', '#9e5ad6'], source: `function setup() end\n\nfunction loop()\n  local b = 0.45 + 0.55 * (math.sin(luxio_millis() / 1800) + 1) / 2\n  for i = 0, luxio_get_pixel_count() - 1 do\n    luxio_set_pixel_color(i, math.floor(245 * b),\n      math.floor(95 * b), math.floor(160 * b))\n  end\nend` },
  { name: 'Prism', description: 'A spectrum, one pixel at a time', colors: ['#ff9c5a', '#8884ff'], source: `function setup() end\n\nfunction loop()\n  for i = 0, luxio_get_pixel_count() - 1 do\n    local p = i / 8 + luxio_millis() / 1600\n    luxio_set_pixel_color(i, math.floor(127.5 + 127.5 * math.sin(p)),\n      math.floor(127.5 + 127.5 * math.sin(p + 2.094)),\n      math.floor(127.5 + 127.5 * math.sin(p + 4.189)))\n  end\nend` },
  { name: 'Candlelight', description: 'Warm white, for RGBCCT strips', colors: ['#ffe4ad', '#be8f58'], source: `function setup() end\n\nfunction loop()\n  local glow = math.floor(190 + 30 * math.sin(luxio_millis() / 900))\n  for i = 0, luxio_get_pixel_count() - 1 do\n    -- index, red, green, blue, white, warm white, cool white\n    luxio_set_pixel_color(i, 0, 0, 0, 0, glow, 0)\n  end\nend` },
];

// Parameterized Studio examples shipped before the shared iOS preset set.
export const previousPresets = [
  { name: 'Aurora', description: 'A slow drift through violet and teal', colors: ['#967aff', '#37d7b0'], source: `-- @preview 967aff,37d7b0
-- @parameter Speed,Slider,50,0,100
-- @parameter Spacing,Number,9,1,64
-- @parameter Reverse,Checkbox,false

function setup() end

function loop()
  local phase = luxio_millis() / 2600 * luxio_get_parameter("Speed") / 50
  if luxio_get_parameter("Reverse") then phase = -phase end
  local spacing = luxio_get_parameter("Spacing")
  for i = 0, luxio_get_pixel_count() - 1 do
    local t = (math.sin(i / spacing + phase) + 1) / 2
    luxio_set_pixel_color(i, math.floor(45 + 105 * t),
      math.floor(210 - 120 * t), math.floor(175 + 80 * t))
  end
end` },
  { name: 'Ember', description: 'The quiet glow of a fading fire', colors: ['#ff7b3a', '#d13248'], source: `-- @preview ff7b3a,d13248
-- @parameter Speed,Slider,50,0,100
-- @parameter Intensity,Slider,100,0,100
-- @parameter Flicker,Checkbox,true

function setup() end

function loop()
  local t = luxio_millis() / 1000 * luxio_get_parameter("Speed") / 50
  local intensity = luxio_get_parameter("Intensity") / 100
  local flicker = luxio_get_parameter("Flicker")
  for i = 0, luxio_get_pixel_count() - 1 do
    local glow = flicker and (math.sin(i * 0.7 + t) + 1) / 2 or 0.5
    luxio_set_pixel_color(i, math.floor((140 + 115 * glow) * intensity),
      math.floor((18 + 60 * glow) * intensity), math.floor((5 + 10 * glow) * intensity))
  end
end` },
  { name: 'Tidal', description: 'Deep blue, moving at its own pace', colors: ['#275bff', '#55dce5'], source: `-- @preview 275bff,55dce5
-- @parameter Speed,Slider,50,0,100
-- @parameter Spacing,Number,5,1,64
-- @parameter Reverse,Checkbox,false

function setup() end

function loop()
  local t = luxio_millis() / 1800 * luxio_get_parameter("Speed") / 50
  if luxio_get_parameter("Reverse") then t = -t end
  local spacing = luxio_get_parameter("Spacing")
  for i = 0, luxio_get_pixel_count() - 1 do
    local wave = (math.sin(i / spacing - t) + 1) / 2
    luxio_set_pixel_color(i, 12, math.floor(30 + wave * 150),
      math.floor(100 + wave * 155))
  end
end` },
  { name: 'Rose', description: 'Soft pink with a gentle breath', colors: ['#f38fb9', '#9e5ad6'], source: `-- @preview f38fb9,9e5ad6
-- @parameter Speed,Slider,50,0,100
-- @parameter Intensity,Slider,100,0,100
-- @parameter Pulse,Checkbox,true

function setup() end

function loop()
  local phase = luxio_millis() / 1800 * luxio_get_parameter("Speed") / 50
  local b = luxio_get_parameter("Pulse") and 0.45 + 0.55 * (math.sin(phase) + 1) / 2 or 1
  b = b * luxio_get_parameter("Intensity") / 100
  for i = 0, luxio_get_pixel_count() - 1 do
    luxio_set_pixel_color(i, math.floor(245 * b),
      math.floor(95 * b), math.floor(160 * b))
  end
end` },
  { name: 'Prism', description: 'A spectrum, one pixel at a time', colors: ['#ff9c5a', '#8884ff'], source: `-- @preview ff9c5a,8884ff
-- @parameter Speed,Slider,50,0,100
-- @parameter Spacing,Number,8,1,64
-- @parameter Reverse,Checkbox,false

function setup() end

function loop()
  local phase = luxio_millis() / 1600 * luxio_get_parameter("Speed") / 50
  if luxio_get_parameter("Reverse") then phase = -phase end
  local spacing = luxio_get_parameter("Spacing")
  for i = 0, luxio_get_pixel_count() - 1 do
    local p = i / spacing + phase
    luxio_set_pixel_color(i, math.floor(127.5 + 127.5 * math.sin(p)),
      math.floor(127.5 + 127.5 * math.sin(p + 2.094)),
      math.floor(127.5 + 127.5 * math.sin(p + 4.189)))
  end
end` },
  { name: 'Candlelight', description: 'Warm white, for RGBCCT strips', colors: ['#ffe4ad', '#be8f58'], source: `-- @preview ffe4ad,be8f58
-- @parameter Speed,Slider,50,0,100
-- @parameter Intensity,Slider,100,0,100
-- @parameter Flicker,Checkbox,true

function setup() end

function loop()
  local phase = luxio_millis() / 900 * luxio_get_parameter("Speed") / 50
  local glow = luxio_get_parameter("Flicker") and 190 + 30 * math.sin(phase) or 190
  glow = math.floor(glow * luxio_get_parameter("Intensity") / 100)
  for i = 0, luxio_get_pixel_count() - 1 do
    -- index, red, green, blue, white, warm white, cool white
    luxio_set_pixel_color(i, 0, 0, 0, 0, glow, 0)
  end
end` },
];
