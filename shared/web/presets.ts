// Matches Luxio iOS LightPreset animations, including source, controls and preview colors.
export const presets = [
  {
    "name": "Rainbow",
    "description": "A moving spectrum across the strip",
    "colors": [
      "#ff0000",
      "#ffff00",
      "#00ff00",
      "#00ffff",
      "#0000ff",
      "#ff00ff"
    ],
    "source": "-- @preview ff0000,ffff00,00ff00,00ffff,0000ff,ff00ff\n-- @parameter Speed,Slider,50,0,100\n-- @parameter Period,Number,20,1,120\n-- @parameter Reverse,Checkbox,false\nfunction setup() end\nfunction loop()\n  local count = luxio_get_pixel_count()\n  local time = luxio_millis() / (luxio_get_parameter(\"Period\") * 1000) * luxio_get_parameter(\"Speed\") / 50\n  if luxio_get_parameter(\"Reverse\") then time = -time end\n  for i = 0, count - 1 do\n    local h = (time + i / count) % 1 * 6\n    local sector = math.floor(h)\n    local up = math.floor((h - sector) * 255)\n    local down = 255 - up\n    local r, g, b = 0, 0, 0\n    if sector == 0 then r, g = 255, up\n    elseif sector == 1 then r, g = down, 255\n    elseif sector == 2 then g, b = 255, up\n    elseif sector == 3 then g, b = down, 255\n    elseif sector == 4 then r, b = up, 255\n    else r, b = 255, down end\n    luxio_set_pixel_color(i, r, g, b)\n  end\nend"
  },
  {
    "name": "Colorloop",
    "description": "A uniform cycle through the spectrum",
    "colors": [
      "#ff0000",
      "#ffff00",
      "#00ff00",
      "#00ffff",
      "#0000ff",
      "#ff00ff"
    ],
    "source": "-- @preview ff0000,ffff00,00ff00,00ffff,0000ff,ff00ff\n-- @parameter Speed,Slider,50,0,100\n-- @parameter Period,Number,20,1,120\n-- @parameter Reverse,Checkbox,false\nfunction setup() end\nfunction loop()\n  local count = luxio_get_pixel_count()\n  local time = luxio_millis() / (luxio_get_parameter(\"Period\") * 1000) * luxio_get_parameter(\"Speed\") / 50\n  if luxio_get_parameter(\"Reverse\") then time = -time end\n  for i = 0, count - 1 do\n    local h = (time) % 1 * 6\n    local sector = math.floor(h)\n    local up = math.floor((h - sector) * 255)\n    local down = 255 - up\n    local r, g, b = 0, 0, 0\n    if sector == 0 then r, g = 255, up\n    elseif sector == 1 then r, g = down, 255\n    elseif sector == 2 then g, b = 255, up\n    elseif sector == 3 then g, b = down, 255\n    elseif sector == 4 then r, b = up, 255\n    else r, b = 255, down end\n    luxio_set_pixel_color(i, r, g, b)\n  end\nend"
  },
  {
    "name": "Aurora",
    "description": "A pulsing violet glow",
    "colors": [
      "#2d1859",
      "#8246ff"
    ],
    "source": "-- @preview 2d1859,8246ff\n-- @parameter Speed,Slider,50,0,100\n-- @parameter Spacing,Number,8,1,64\n-- @parameter Pulse,Checkbox,true\nfunction setup() end\nfunction loop()\n  local phase = luxio_millis() / 1800 * luxio_get_parameter(\"Speed\") / 50\n  for i = 0, luxio_get_pixel_count() - 1 do\n    local t = luxio_get_parameter(\"Pulse\") and (0.35 + 0.65 * (math.sin(i / luxio_get_parameter(\"Spacing\") + phase) + 1) / 2) or 1\n    luxio_set_pixel_color(i, math.floor(130 * t), math.floor(70 * t), math.floor(255 * t))\n  end\nend"
  },
  {
    "name": "Ember",
    "description": "A pulsing ember glow",
    "colors": [
      "#591804",
      "#ff460c"
    ],
    "source": "-- @preview 591804,ff460c\n-- @parameter Speed,Slider,50,0,100\n-- @parameter Spacing,Number,8,1,64\n-- @parameter Pulse,Checkbox,true\nfunction setup() end\nfunction loop()\n  local phase = luxio_millis() / 1800 * luxio_get_parameter(\"Speed\") / 50\n  for i = 0, luxio_get_pixel_count() - 1 do\n    local t = luxio_get_parameter(\"Pulse\") and (0.35 + 0.65 * (math.sin(i / luxio_get_parameter(\"Spacing\") + phase) + 1) / 2) or 1\n    luxio_set_pixel_color(i, math.floor(255 * t), math.floor(70 * t), math.floor(12 * t))\n  end\nend"
  },
  {
    "name": "Tidal",
    "description": "A pulsing ocean blue",
    "colors": [
      "#053159",
      "#0f8cff"
    ],
    "source": "-- @preview 053159,0f8cff\n-- @parameter Speed,Slider,50,0,100\n-- @parameter Spacing,Number,8,1,64\n-- @parameter Pulse,Checkbox,true\nfunction setup() end\nfunction loop()\n  local phase = luxio_millis() / 1800 * luxio_get_parameter(\"Speed\") / 50\n  for i = 0, luxio_get_pixel_count() - 1 do\n    local t = luxio_get_parameter(\"Pulse\") and (0.35 + 0.65 * (math.sin(i / luxio_get_parameter(\"Spacing\") + phase) + 1) / 2) or 1\n    luxio_set_pixel_color(i, math.floor(15 * t), math.floor(140 * t), math.floor(255 * t))\n  end\nend"
  }
];
