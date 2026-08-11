package pt.esferavetorial.app;

import android.app.Activity;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;

public final class MainActivity extends Activity implements SensorEventListener {
    private SensorManager sensorManager;
    private Sensor activeSensor;
    private boolean accelerometerFallback;
    private VectorBallView gameView;
    private final float[] filtered = new float[3];
    private boolean filterReady;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);

        gameView = new VectorBallView(this);
        setContentView(gameView);

        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        activeSensor = sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY);
        if (activeSensor == null) {
            activeSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            accelerometerFallback = true;
        }
        gameView.setSensorAvailable(activeSensor != null, accelerometerFallback);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (activeSensor != null) {
            sensorManager.registerListener(this, activeSensor, SensorManager.SENSOR_DELAY_GAME);
        }
    }

    @Override
    protected void onPause() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        super.onPause();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        float x = event.values[0];
        float y = event.values[1];
        float z = event.values[2];
        if (accelerometerFallback) {
            final float alpha = 0.86f;
            if (!filterReady) {
                filtered[0] = x; filtered[1] = y; filtered[2] = z;
                filterReady = true;
            } else {
                filtered[0] = alpha * filtered[0] + (1f - alpha) * x;
                filtered[1] = alpha * filtered[1] + (1f - alpha) * y;
                filtered[2] = alpha * filtered[2] + (1f - alpha) * z;
            }
            x = filtered[0]; y = filtered[1]; z = filtered[2];
        }
        gameView.setGravity(x, y, z);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // Nothing to do; the visual simulation tolerates normal sensor noise.
    }
}
