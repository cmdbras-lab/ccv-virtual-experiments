package pt.esferavetorial.app;

public final class BallPhysics {
    public float x, y, vx, vy, ax, ay;
    public float distance;
    public boolean realSphere = true;

    private static final float REAL_SPHERE_FACTOR = 5f / 7f;
    private static final float ROLLING_RESISTANCE = 0.045f;
    private static final float LINEAR_DRAG = 0.10f;
    private static final float RESTITUTION = 0.58f;
    private static final float STOP_SPEED = 0.010f;

    public void reset(float widthM, float heightM) {
        x = widthM * 0.28f;
        y = heightM * 0.50f;
        vx = vy = ax = ay = 0f;
        distance = 0f;
    }

    public float speed() {
        return (float) Math.hypot(vx, vy);
    }

    public float acceleration() {
        return (float) Math.hypot(ax, ay);
    }

    public void update(float dt, float gravityX, float gravityY,
                       float widthM, float heightM, float radiusM) {
        if (dt <= 0f) return;
        dt = Math.min(dt, 0.035f);

        float factor = realSphere ? REAL_SPHERE_FACTOR : 1f;
        float baseAx = factor * gravityX;
        float baseAy = factor * gravityY;

        float speed = speed();
        float frictionX = 0f;
        float frictionY = 0f;
        if (speed > 1e-4f) {
            frictionX = -ROLLING_RESISTANCE * vx / speed;
            frictionY = -ROLLING_RESISTANCE * vy / speed;
        }

        ax = baseAx + frictionX - LINEAR_DRAG * vx;
        ay = baseAy + frictionY - LINEAR_DRAG * vy;

        float oldX = x;
        float oldY = y;

        vx += ax * dt;
        vy += ay * dt;

        if (Math.abs(baseAx) < ROLLING_RESISTANCE && Math.abs(vx) < STOP_SPEED) vx = 0f;
        if (Math.abs(baseAy) < ROLLING_RESISTANCE && Math.abs(vy) < STOP_SPEED) vy = 0f;

        x += vx * dt;
        y += vy * dt;

        float left = radiusM;
        float right = widthM - radiusM;
        float top = radiusM;
        float bottom = heightM - radiusM;

        if (x < left) {
            x = left;
            if (vx < 0f) vx = -vx * RESTITUTION;
        } else if (x > right) {
            x = right;
            if (vx > 0f) vx = -vx * RESTITUTION;
        }
        if (y < top) {
            y = top;
            if (vy < 0f) vy = -vy * RESTITUTION;
        } else if (y > bottom) {
            y = bottom;
            if (vy > 0f) vy = -vy * RESTITUTION;
        }

        distance += (float) Math.hypot(x - oldX, y - oldY);
    }
}
