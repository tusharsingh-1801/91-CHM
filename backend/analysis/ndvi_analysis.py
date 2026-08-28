import json
import math
import sys
from statistics import mean, pstdev

from sklearn.linear_model import LinearRegression


def analyze_ndvi(payload):
    observations = payload.get("observations", [])
    language_code = payload.get("languageCode", "en-IN")
    values = []
    for observation in observations:
        try:
            value = float(observation["ndvi_value"])
        except (KeyError, TypeError, ValueError):
            continue
        if math.isfinite(value):
            values.append(value)

    if not values:
        return {
            "status": "insufficient_data",
            "statusLabel": "डेटा उपलब्ध नहीं" if language_code == "hi-IN" else "Not enough data",
            "summary": "कम से कम दो NDVI observations जोड़ें।" if language_code == "hi-IN" else "Add at least two NDVI observations to analyse the trend.",
            "observations": 0,
        }

    sample_count = len(values)
    features = [[index] for index in range(sample_count)]
    model = LinearRegression().fit(features, values)
    slope = float(model.coef_[0])
    average = mean(values)
    volatility = pstdev(values) if sample_count > 1 else 0.0
    next_value = float(model.predict([[sample_count]])[0])
    if slope > 0.001:
        trend = "improving"
        trend_label = "सुधार" if language_code == "hi-IN" else "Improving"
    elif slope < -0.001:
        trend = "declining"
        trend_label = "गिरावट" if language_code == "hi-IN" else "Declining"
    else:
        trend = "stable"
        trend_label = "स्थिर" if language_code == "hi-IN" else "Stable"

    if language_code == "hi-IN":
        summary = f"NDVI trend {trend_label.lower()} है। अगले observation का अनुमान {next_value:.3f} है।"
        recommendation = "गिरावट जारी हो तो field inspection और moisture data की जाँच करें।" if trend == "declining" else "अगले satellite observation के साथ trend की निगरानी जारी रखें।"
    else:
        summary = f"NDVI trend is {trend_label.lower()}. The next observation is estimated at {next_value:.3f}."
        recommendation = "Inspect the field and review moisture data if the decline continues." if trend == "declining" else "Keep monitoring with the next satellite observation."

    return {
        "status": "analysed",
        "statusLabel": trend_label,
        "trend": trend,
        "summary": summary,
        "recommendation": recommendation,
        "observations": sample_count,
        "average": round(average, 4),
        "slopePerObservation": round(slope, 5),
        "volatility": round(volatility, 4),
        "predictedNext": round(next_value, 4),
        "rSquared": round(float(model.score(features, values)), 4) if sample_count > 1 else None,
    }


if __name__ == "__main__":
    try:
        request_payload = json.load(sys.stdin)
        print(json.dumps(analyze_ndvi(request_payload), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
