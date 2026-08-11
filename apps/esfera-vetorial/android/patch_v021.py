from pathlib import Path

java_path = Path('app/src/main/java/pt/esferavetorial/app/VectorBallView.java')
gradle_path = Path('app/build.gradle')

text = java_path.read_text(encoding='utf-8')


def replace_once(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f'Padrão não encontrado:\n{old}')
    text = text.replace(old, new, 1)

replace_once(
    '    private float initialSpeed = 0.18f;\n    private boolean draggingSpeed;',
    '    private static final float TRAJECTORY_SPEED_MIN = 0.01f;\n'
    '    private static final float TRAJECTORY_SPEED_MAX = 0.06f;\n'
    '    private static final float[] TRAJECTORY_TIME_SCALES = {1f, 0.5f, 0.25f, 0.125f};\n'
    '    private float initialSpeed = 0.04f;\n'
    '    private int trajectoryTimeScaleIndex;\n'
    '    private boolean draggingSpeed;'
)

replace_once(
    '    private void drawMode2(Canvas canvas, float dt) {\n'
    '        advanceTrajectory(dt);',
    '    private float trajectoryTimeScale() {\n'
    '        return TRAJECTORY_TIME_SCALES[Math.max(0, Math.min(TRAJECTORY_TIME_SCALES.length - 1, trajectoryTimeScaleIndex))];\n'
    '    }\n\n'
    '    private String trajectoryTimeScaleLabel() {\n'
    '        switch (trajectoryTimeScaleIndex) {\n'
    '            case 1: return "1/2×";\n'
    '            case 2: return "1/4×";\n'
    '            case 3: return "1/8×";\n'
    '            default: return "1×";\n'
    '        }\n'
    '    }\n\n'
    '    private void drawMode2(Canvas canvas, float dt) {\n'
    '        // A câmara lenta altera apenas o avanço temporal da animação.\n'
    '        // v e a continuam a ser calculadas e apresentadas em unidades físicas reais.\n'
    '        advanceTrajectory(dt * trajectoryTimeScale());'
)

replace_once(
    '                    650f * density, 180f * density,\n'
    '                    Math.min(getWidth() * 0.62f, 250f * density), showComponents);',
    '                    1900f * density, 2400f * density,\n'
    '                    Math.min(getWidth() * 0.82f, 330f * density), showComponents);'
)

replace_once(
    '        canvas.drawText(String.format(Locale.US, "v₀ = %.2f m/s • trajetória %.2f m • %s", initialSpeed, trajectoryTotalM, state), pad + 12f * density, top + 114f * density, textPaint);',
    '        canvas.drawText(String.format(Locale.US, "v₀ = %.2f m/s • traj. %.2f m • reprodução %s • %s",\n'
    '                initialSpeed, trajectoryTotalM, trajectoryTimeScaleLabel(), state),\n'
    '                pad + 12f * density, top + 114f * density, textPaint);'
)

replace_once(
    '        float normalized = (initialSpeed - 0.04f) / (0.40f - 0.04f);',
    '        float normalized = (initialSpeed - TRAJECTORY_SPEED_MIN) / (TRAJECTORY_SPEED_MAX - TRAJECTORY_SPEED_MIN);'
)

replace_once(
    '                showComponents ? "Componentes ✓" : "Componentes",\n'
    '                "Menu"',
    '                showComponents ? "Componentes ✓" : "Componentes",\n'
    '                "Slow " + trajectoryTimeScaleLabel()'
)

replace_once(
    '        initialSpeed = 0.04f + n * (0.40f - 0.04f);',
    '        initialSpeed = TRAJECTORY_SPEED_MIN + n * (TRAJECTORY_SPEED_MAX - TRAJECTORY_SPEED_MIN);'
)

replace_once(
    '            case 3:\n'
    '                appMode = APP_MENU;\n'
    '                trajectoryRunning = false;\n'
    '                invalidate();\n'
    '                break;',
    '            case 3:\n'
    '                trajectoryTimeScaleIndex = (trajectoryTimeScaleIndex + 1) % TRAJECTORY_TIME_SCALES.length;\n'
    '                invalidate();\n'
    '                break;'
)

java_path.write_text(text, encoding='utf-8')

gradle = gradle_path.read_text(encoding='utf-8')
if "versionCode 7" not in gradle or "versionName '0.2.0'" not in gradle:
    raise SystemExit('Versão base inesperada em build.gradle')
gradle = gradle.replace('versionCode 7', 'versionCode 8', 1)
gradle = gradle.replace("versionName '0.2.0'", "versionName '0.2.1'", 1)
gradle_path.write_text(gradle, encoding='utf-8')

print('Patch v0.2.1 aplicado com sucesso')
